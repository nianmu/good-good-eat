"""HowToCook（https://gitee.com/Anduin2017/HowToCook）菜谱批量导入器。

上游仓库为统一模板 Markdown（标题「菜名 的做法」+ 介绍 + 预估烹饪难度/卡路里 +
必备原料和工具 + 计算 + 操作 + 附加内容），本脚本将其解析、映射后幂等 upsert 进库：
- 分类：按上游目录映射为中文分类（与现有 6 类同名的复用现有分类，其余新建）
- 菜品 Dish：新增=基准价 + 默认评分；同名=保留 price/rating，更新描述/食材/耗时/难度/图片
- 菜谱 Recipe：官方账号归属、公开、steps=「操作」节步骤数组、关联 dish_id
- 图片：解析 md 内图片引用 → Gitee raw 在线链接（https://gitee.com/Anduin2017/HowToCook/raw/master/<相对路径>）
- 增量同步：--pull 时先 `git -C <src> pull --ff-only`，再重跑本脚本即完成「定期拉取最新变化」

许可证：HowToCook 采用 Unlicense（公有领域），可自由复制/修改/商用。

用法：
    uv run python seed/import_howtocook.py                  # 导入开发库（默认 src=项目根/HowToCook）
    uv run python seed/import_howtocook.py --dry-run        # 只统计不写库
    uv run python seed/import_howtocook.py --limit 10       # 只处理前 10 篇（调试）
    uv run python seed/import_howtocook.py --pull           # 先 git pull 再导入
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

# 独立运行时将 server/ 加入 sys.path（import 复用时已存在则跳过）
SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.dish import Category, Dish
from app.models.recipe import Recipe
from app.models.user import User

# ─────────────────────────── 上游目录 → 本项目分类配置 ───────────────────────────
# name 与现有 6 类同名的（荤菜/蔬菜也要吃呀/汤/主食）复用现有分类，其余新建；
# role 与 dishes.py 的 _CATEGORY_ROLE 营养类型一致（meat/veg/energy/soup/staple/cold/other）
HTC_CATEGORIES: dict[str, dict] = {
    "meat_dish": {"name": "荤菜", "icon": "🥩", "color": "#FFAB91", "role": "meat", "base_price": 25.00},
    "vegetable_dish": {"name": "蔬菜也要吃呀", "icon": "🥬", "color": "#A5D6A7", "role": "veg", "base_price": 12.00},
    "aquatic": {"name": "水产", "icon": "🐟", "color": "#90CAF9", "role": "meat", "base_price": 30.00},
    "staple": {"name": "主食", "icon": "🍚", "color": "#FFE0B2", "role": "staple", "base_price": 10.00},
    "soup": {"name": "饭后最后一口汤", "icon": "🍲", "color": "#FFF59D", "role": "soup", "base_price": 15.00},
    "breakfast": {"name": "早餐", "icon": "🥣", "color": "#FFE082", "role": "energy", "base_price": 8.00},
    "dessert": {"name": "甜品", "icon": "🍰", "color": "#F8BBD0", "role": "energy", "base_price": 12.00},
    "drink": {"name": "饮品", "icon": "🧃", "color": "#B3E5FC", "role": "other", "base_price": 8.00},
    "semi-finished": {"name": "半成品", "icon": "🥫", "color": "#D7CCC8", "role": "other", "base_price": 15.00},
    "condiment": {"name": "调料", "icon": "🧂", "color": "#CE93D8", "role": "other", "base_price": 3.00},
}
# 处理顺序即主分类优先级（同名菜多目录出现时，靠前的目录优先）
HTC_ORDER = ["meat_dish", "vegetable_dish", "aquatic", "staple", "soup", "breakfast", "dessert", "drink", "semi-finished", "condiment"]

# 默认评分（上游无评分体系）
DEFAULT_RATING = 4.5
DEFAULT_RATING_COUNT = 100

# Gitee raw 前缀（图片在线链接）
RAW_BASE = "https://gitee.com/Anduin2017/HowToCook/raw/master"

_HEADING_RE = re.compile(r"^#{1,6}\s+(.+)$")
_INGREDIENT_LINE_RE = re.compile(r"^[-*]\s+(.+)$")
_STEP_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．]\s*(.+)$")
_IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
_STAGE_RE = re.compile(r"^##\s+(.+)$")
_STAR_RE = re.compile(r"^预估烹饪难度[:：]\s*(.*)$")
_CALORIE_RE = re.compile(r"^预估卡路里[:：]\s*(\d+)\s*大卡")
_COOK_TIME_RE = re.compile(r"(?:大约|约|大概)?\s*(\d+)\s*分钟")
_COOK_HOUR_RE = re.compile(r"(?:大约|约|大概)?\s*(\d+)\s*小时")
_COMMENT_LINE_RE = re.compile(r"^\s*<!--")
_IMAGE_LINE_RE = re.compile(r"^\s*!\[")
# 去掉行尾「（推荐品牌xx）」「（可选）」等容器备注，食材名更干净
_INGREDIENT_NOTE_RE = re.compile(r"（(?:推荐|可选)[^）]*）$")

# ★ 星级 → 难度；星标说明：1-2★ 简单、3★ 需一定经验、4-5★ 复杂
_STAR_DIFFICULTY = {1: "简单", 2: "简单", 3: "中等", 4: "较难", 5: "较难"}
# 无耗时信息时的星级估算（模板说明：1★≈5min、2★≈10min、3★≈15min、4★≈40min、5★≈60min）
_STAR_TIME = {1: 5, 2: 10, 3: 15, 4: 40, 5: 60}

DESC_MAX = 100  # 菜单卡片简介截断长度


def _desc_cut(text: str, max_len: int = DESC_MAX) -> str:
    """简介截断：压缩换行、超长加省略号（供菜品描述/菜谱描述共用）。"""
    text = text.replace("\n", " ").strip()
    return text if len(text) <= max_len else text[: max_len - 1] + "…"


# ─────────────────────────── 解析（纯函数，可单测） ───────────────────────────


def parse_dish_md(text: str, file_stem: str = "") -> dict:
    """把单篇 HowToCook md 解析为结构化 dict（无副作用）。

    返回字段：name/description/stars/difficulty/calories/cook_time/
              ingredients/steps/tips/image_ref（image_ref 为 md 内原始图片引用路径）
    """
    lines = text.splitlines()
    name = ""
    description_parts: list[str] = []
    ingredients: list[str] = []
    steps: list[str] = []
    tips: list[str] = []
    image_ref: str | None = None
    stars = 0
    calories: int | None = None
    cook_time: int | None = None

    section = ""  # 当前章节：intro / ingredients / calc / operation / tips
    step_no = 0

    for raw in lines:
        line = raw.strip()
        if not line or _COMMENT_LINE_RE.match(line):
            continue

        # 标题：菜名
        if line.startswith("# ") and not name:
            name = re.sub(r"的做法\s*$", "", line[2:].strip()).strip()
            section = "intro"
            continue

        # 二级章节
        m = _STAGE_RE.match(line)
        if m:
            sec = m.group(1).strip()
            section = {
                "必备原料和工具": "ingredients",
                "计算": "calc",
                "操作": "operation",
                "附加内容": "tips",
            }.get(sec, "")
            continue

        # 难度 / 卡路里（介绍区）
        if stars == 0:
            sm = _STAR_RE.match(line)
            if sm:
                stars = sm.group(1).count("★")
                continue
        if calories is None:
            cm = _CALORIE_RE.match(line)
            if cm:
                calories = int(cm.group(1))
                continue

        # 图片引用
        if image_ref is None:
            im = _IMG_RE.search(line)
            if im:
                image_ref = im.group(1).strip()
                continue

        # 各章节内容
        if section == "intro":
            if not _IMAGE_LINE_RE.match(line):
                description_parts.append(line)
        elif section == "ingredients":
            im2 = _INGREDIENT_LINE_RE.match(line)
            if im2:
                item = _INGREDIENT_NOTE_RE.sub("", im2.group(1).strip()).strip()
                if item:
                    ingredients.append(item)
        elif section == "operation":
            sm2 = _STEP_LINE_RE.match(line)
            if sm2:
                step_no += 1
                steps.append(f"{sm2.group(2).strip()}")
            elif step_no > 0 and steps:
                # 子项/续行并入当前步骤
                steps[-1] = f"{steps[-1]}\n{line}"
        elif section == "tips":
            im3 = _INGREDIENT_LINE_RE.match(line)
            if im3:
                tip = im3.group(1).strip()
                if tip and not tip.startswith("如果您遵循本指南"):
                    tips.append(tip)

    # 耗时：优先介绍中的「X 分钟」，其次「X 小时」（≤3 小时才采纳，避免"1 小时"变 60 的误读），再按星级估算
    intro_text = "\n".join(description_parts)
    if cook_time is None:
        tm = _COOK_TIME_RE.search(intro_text)
        if tm:
            cook_time = int(tm.group(1))
    if cook_time is None:
        hm = _COOK_HOUR_RE.search(intro_text)
        if hm and int(hm.group(1)) <= 3:
            cook_time = int(hm.group(1)) * 60
    if cook_time is None and stars:
        cook_time = _STAR_TIME.get(stars)

    return {
        "name": name or file_stem,
        "description": "\n".join(description_parts).strip() or "",
        "stars": stars,
        "difficulty": _STAR_DIFFICULTY.get(stars) if stars else None,
        "calories": calories,
        "cook_time": cook_time,
        "ingredients": ingredients,
        "steps": steps,
        "tips": tips,
        "image_ref": image_ref,
    }


def _url_safe(segments: list) -> str:
    """把路径段拼成可安全 URL 编码的字符串。

    异常文件名（如解压后出现 surrogate/非法字符）容错：按 utf-8 replace 归一，
    避免 UnicodeEncodeError 中断整个导入。
    """
    joined = "/".join(segments)
    return joined.encode("utf-8", "replace").decode("utf-8")


def resolve_image_url(md_rel: Path, image_ref: str | None) -> str | None:
    """图片引用 → 可访问 URL（纯路径运算，不依赖 cwd）。

    - http(s) 外链：原样返回
    - 相对路径：以 md 所在目录为基准（自动归一 ./ 与 ../、支持嵌套子目录），
      保留 dishes/ 段拼 Gitee raw 链接并 URL 编码（中文/空格可用）
    """
    if not image_ref:
        return None
    if re.match(r"^https?://", image_ref):
        return image_ref
    base = PurePosixPath(md_rel.as_posix()).parent  # 例：dishes/vegetable_dish/凉拌木耳
    p = base / image_ref.replace("\\", "/")
    parts = p.parts
    if "dishes" not in parts:
        return None
    idx = parts.index("dishes")
    rest = parts[idx:]  # 保留 dishes/ 前缀段
    if any(s == ".." for s in rest):
        return None  # 越界到 dishes 之外
    return RAW_BASE + "/" + quote(_url_safe(rest), safe="/")


# ─────────────────────────── 落库（幂等 upsert） ───────────────────────────


def _get_or_create_category(db: Session, cat_dir: str) -> Category:
    cfg = HTC_CATEGORIES[cat_dir]
    cat = db.scalar(select(Category).where(Category.name == cfg["name"]).limit(1))
    if cat is None:
        max_order = db.scalar(select(Category.sort_order).order_by(Category.sort_order.desc()).limit(1)) or 0
        cat = Category(name=cfg["name"], icon=cfg["icon"], sort_order=max_order + 1)
        db.add(cat)
        db.flush()
    return cat


def _upsert_recipe(
    db: Session, official: User, dish: Dish, rec: dict, dish_description: str
) -> str | None:
    """为菜品写入/更新官方公开菜谱；返回 'new'=新建 / 'updated'=内容刷新 / None=无操作。"""
    exists = db.scalar(
        select(Recipe).where(Recipe.dish_id == dish.id, Recipe.is_public.is_(True)).limit(1)
    )
    steps = json.dumps(rec["steps"], ensure_ascii=False) if rec["steps"] else None
    ingredients = json.dumps(rec["ingredients"], ensure_ascii=False) if rec["ingredients"] else None

    if exists is None and not steps:
        return None  # 无操作步骤则不为新菜建空菜谱
    if exists is None:
        db.add(
            Recipe(
                user_id=official.id,
                dish_id=dish.id,
                category_id=dish.category_id,
                name=rec["name"],
                emoji=dish.emoji or "🍽",
                color=dish.color or "#4CAF50",
                description=dish_description,
                ingredients=ingredients or dish.ingredients,
                steps=steps or "[]",
                cook_time=rec.get("cook_time") or dish.cook_time,
                difficulty=rec.get("difficulty") or dish.difficulty,
                image_url=dish.image_url,
                is_public=True,
            )
        )
        db.flush()
        return "new"

    # 已有公开菜谱：增量刷新内容（保留 id/收藏关系）
    changed = False
    if steps:
        exists.steps, changed = steps, True
    if ingredients:
        exists.ingredients, changed = ingredients, True
    if dish_description:
        exists.description, changed = dish_description, True
    if rec.get("cook_time"):
        exists.cook_time, changed = rec["cook_time"], True
    if rec.get("difficulty"):
        exists.difficulty, changed = rec["difficulty"], True
    if dish.image_url:
        exists.image_url, changed = dish.image_url, True
    exists.emoji, exists.color = dish.emoji or "🍽", dish.color or "#4CAF50"
    return "updated" if changed else None


def collect_records(src: Path, limit: int | None = None) -> tuple[list[dict], int, list[str]]:
    """扫描 src/dishes/**/*.md 解析为导入记录（按菜名去重）。

    返回 (records, scanned, parse_errors)；records 供 import_howtocook / export_howtocook_sql 共用。
    records 字段：cat_dir/name/description/tips/cook_time/difficulty/ingredients/steps/image_url
    """
    files: list[tuple[str, Path]] = []
    for cat_dir in HTC_ORDER:
        cat_path = src / "dishes" / cat_dir
        if not cat_path.is_dir():
            continue
        for md in sorted(cat_path.rglob("*.md")):
            files.append((cat_dir, md))
    if limit:
        files = files[:limit]

    parsed_errs: list[str] = []
    records: list[dict] = []
    for cat_dir, md in files:
        try:
            data = parse_dish_md(md.read_text(encoding="utf-8"), md.stem)
        except Exception as exc:  # noqa: BLE001 单篇失败不中断整体
            parsed_errs.append(f"{md.relative_to(src)}: {exc}")
            continue
        md_rel = md.relative_to(src)
        records.append(
            {
                "cat_dir": cat_dir,
                "name": data["name"],
                "description": _desc_cut(data["description"]),
                "tips": data["tips"],
                "cook_time": data["cook_time"],
                "difficulty": data["difficulty"] or "简单",
                "ingredients": data["ingredients"],
                "steps": data["steps"],
                "image_url": resolve_image_url(md_rel, data["image_ref"]),
            }
        )

    # 同名去重（按扫描顺序后者覆盖，主分类优先）
    dedup: dict[str, dict] = {}
    for rec in records:
        dedup[rec["name"]] = rec
    return list(dedup.values()), len(files), parsed_errs


def import_howtocook(
    db: Session,
    src: Path,
    *,
    dry_run: bool = False,
    limit: int | None = None,
    update: bool = True,
) -> dict:
    """扫描 src/dishes/**/*.md 解析并幂等 upsert。返回统计。"""

    recs, files, parsed_errs = collect_records(src, limit)
    if dry_run:
        from collections import Counter

        cat_counter = Counter(r["cat_dir"] for r in recs)
        return {
            "mode": "dry-run",
            "scanned": files,
            "parsed": len(recs),
            "parse_errors": parsed_errs,
            "by_category": dict(cat_counter),
            "with_image": sum(1 for r in recs if r["image_url"]),
            "with_steps": sum(1 for r in recs if r["steps"]),
            "with_ingredients": sum(1 for r in recs if r["ingredients"]),
            "duplicates_dropped": files - len(recs) - len(parsed_errs),
            "names": [r["name"] for r in recs],
        }

    # 3. 落库
    official = db.scalar(select(User).where(User.user_code == "OFFICIAL").limit(1))
    if official is None:
        official = User(nickname="好好吃饭·官方菜谱", avatar="🍽", user_code="OFFICIAL", is_guest=False)
        db.add(official)
        db.flush()

    cats_seen: set[str] = set()
    dishes_new = dishes_updated = recipes_new = recipes_updated = 0
    for rec in recs:
        cat_dir = rec["cat_dir"]
        if cat_dir not in cats_seen:
            _get_or_create_category(db, cat_dir)
            cats_seen.add(cat_dir)

    cat_map = {c.name: c for c in db.scalars(select(Category)).all()}
    dish_map = {d.name: d for d in db.scalars(select(Dish)).all()}

    for rec in recs:
        cfg = HTC_CATEGORIES[rec["cat_dir"]]
        cat_id = cat_map[cfg["name"]].id
        dish = dish_map.get(rec["name"])

        recipe_desc = rec["description"] or ""
        if rec["tips"]:
            recipe_desc = f"{recipe_desc}\n\n小贴士：\n- " + "\n- ".join(rec["tips"]) if recipe_desc else "小贴士：\n- " + "\n- ".join(rec["tips"])

        if dish is None:
            dish = Dish(
                category_id=cat_id,
                name=rec["name"],
                price=cfg["base_price"],
                rating=DEFAULT_RATING,
                rating_count=DEFAULT_RATING_COUNT,
                description=rec["description"],
                emoji=cfg["icon"],
                color=cfg["color"],
                image_url=rec["image_url"],
                ingredients=json.dumps(rec["ingredients"], ensure_ascii=False),
                cook_time=rec["cook_time"],
                difficulty=rec["difficulty"],
                is_active=True,
            )
            db.add(dish)
            db.flush()
            dish_map[rec["name"]] = dish
            dishes_new += 1
        elif update:
            # 同名菜：保留运营字段（price/rating/count），刷新内容与图片
            dish.category_id = cat_id
            if rec["description"]:
                dish.description = rec["description"]
            if rec["ingredients"]:
                dish.ingredients = json.dumps(rec["ingredients"], ensure_ascii=False)
            if rec["cook_time"]:
                dish.cook_time = rec["cook_time"]
            if rec["difficulty"]:
                dish.difficulty = rec["difficulty"]
            if rec["image_url"]:
                dish.image_url = rec["image_url"]
            dish.emoji = cfg["icon"]
            dish.color = cfg["color"]
            dishes_updated += 1

        r_state = _upsert_recipe(db, official, dish, rec, recipe_desc)
        if r_state == "new":
            recipes_new += 1
        elif r_state == "updated":
            recipes_updated += 1

    db.commit()
    return {
        "mode": "import",
        "scanned": files,
        "parsed": len(recs),
        "parse_errors": parsed_errs,
        "categories_used": len(cats_seen),
        "dishes_new": dishes_new,
        "dishes_updated": dishes_updated,
        "recipes_new": recipes_new,
        "duplicates_dropped": files - len(recs) - len(parsed_errs),
    }


def git_pull(src: Path) -> None:
    """上游仓库增量拉取（含本机 sslBackend=openssl 的已知修复，见环境指南 §11.2）。"""
    if not (src / ".git").is_dir():
        print(f"[warn] {src} 不是 Git 仓库，跳过 pull")
        return
    subprocess.run(
        ["git", "-C", str(src), "config", "http.sslBackend", "openssl"],
        check=False,
        capture_output=True,
    )
    proc = subprocess.run(
        ["git", "-C", str(src), "pull", "--ff-only"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(f"[warn] git pull 失败：{proc.stderr.strip() or proc.stdout.strip()}")
    else:
        print(f"[git] pull 完成：{proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else 'up to date'}")


def _fmt_stats(st: dict) -> str:
    if st["mode"] == "dry-run":
        lines = [
            f"[dry-run] 扫描 {st['scanned']} 篇 → 解析 {st['parsed']} 道（同名去重丢 {st['duplicates_dropped']}）",
            f"[dry-run] 有图 {st['with_image']} 道 / 有步骤 {st['with_steps']} 道 / 有食材 {st['with_ingredients']} 道",
        ]
        cat = "、".join(f"{k}={v}" for k, v in st["by_category"].items())
        lines.append(f"[dry-run] 分类分布：{cat}")
        if st["parse_errors"]:
            lines.append("[dry-run] 解析失败：" + "；".join(st["parse_errors"][:5]))
        return "\n".join(lines)
    lines = [
        f"[import] 扫描 {st['scanned']} 篇 → 解析 {st['parsed']} 道（同名去重丢 {st['duplicates_dropped']}）",
        f"[import] 新增菜品 {st['dishes_new']} 道、更新 {st['dishes_updated']} 道，"
        f"新增公开菜谱 {st['recipes_new']} 篇（覆盖 {st.get('recipes_updated', 0)} 篇）",
    ]
    if st["parse_errors"]:
        lines.append("[import] 解析失败：" + "；".join(st["parse_errors"][:5]))
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="HowToCook 菜谱批量导入（幂等 upsert）")
    parser.add_argument("--src", type=Path, default=SERVER_DIR.parent / "HowToCook", help="HowToCook 仓库根目录")
    parser.add_argument("--dry-run", action="store_true", help="只解析统计，不连库")
    parser.add_argument("--limit", type=int, default=None, help="只处理前 N 篇（调试）")
    parser.add_argument("--pull", action="store_true", help="先 git pull 上游再导入")
    parser.add_argument("--no-update", action="store_true", help="同名菜品不更新（只新增）")
    args = parser.parse_args()

    # Windows GBK 管道/重定向下 emoji 无法编码会导致日志输出崩溃；改为容错编码
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(errors="backslashreplace")

    if args.pull:
        git_pull(args.src)
    if not (args.src / "dishes").is_dir():
        print(f"[error] 未找到 {args.src}/dishes，请用 --src 指定 HowToCook 仓库路径")
        sys.exit(1)

    if args.dry_run:
        st = import_howtocook(None, args.src, dry_run=True, limit=args.limit)  # type: ignore[arg-type]
        print(_fmt_stats(st))
        return

    db = SessionLocal()
    try:
        st = import_howtocook(db, args.src, limit=args.limit, update=not args.no_update)
        print(_fmt_stats(st))
    finally:
        db.close()


if __name__ == "__main__":
    main()