"""HowToCook 同步 SQL 生成器（新部署模式：本地跑脚本 → 生成 SQL → 线上执行）。

工作流（配合 import_howtocook.py）：
    1. 本地：git pull HowToCook → uv run python seed/import_howtocook.py（更新本地开发库，人工核对）
    2. 本地：uv run python seed/export_howtocook_sql.py → server/seed/output/howtocook_sync_<ts>.sql
    3. 线上：mysql < howtocook_sync_<ts>.sql（幂等，可直接重复执行）

SQL 幂等性：
- 分类/官方账号/菜品/公开菜谱全部按「UPDATE 既有 + INSERT ... WHERE NOT EXISTS」生成；
- 同名菜（线上存量）只刷新内容字段（描述/食材/耗时/难度/emoji/色块/图片/分类），
  不动 price/rating/rating_count 等运营字段；
- 不删除任何线上数据（上游删菜仅意味着 SQL 里不再更新它）；
- 菜谱关联按菜名解析 dish_id，官方账号按 user_code=OFFICIAL 解析。

用法：
    uv run python seed/export_howtocook_sql.py
    uv run python seed/export_howtocook_sql.py --out server/seed/output/howtocook_sync.sql
    uv run python seed/export_howtocook_sql.py --limit 3   # 调试
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from seed.import_howtocook import (  # noqa: E402
    DEFAULT_RATING,
    DEFAULT_RATING_COUNT,
    HTC_CATEGORIES,
    HTC_ORDER,
    collect_records,
)

# ─────────────────────────── SQL 工具 ───────────────────────────


def _q(value) -> str:
    """SQL 字面量：None→NULL、数值原样、字符串单引号转义（MySQL 默认转义 \\ 与 '）。"""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("\\", "\\\\").replace("'", "''")
    return "'" + s + "'"


def _cat_sub(cat_dir: str) -> str:
    return f"(SELECT id FROM categories WHERE name = {_q(HTC_CATEGORIES[cat_dir]['name'])} LIMIT 1)"


def _dish_sub(name: str) -> str:
    return f"(SELECT id FROM dishes WHERE name = {_q(name)} LIMIT 1)"


# 新分类固定 sort_order（荤菜/蔬菜/主食/汤与现有种子对齐，其余追加 7+）
_CAT_SORT = {
    "meat_dish": 1,
    "vegetable_dish": 2,
    "staple": 5,
    "soup": 4,
    "aquatic": 7,
    "breakfast": 8,
    "dessert": 9,
    "drink": 10,
    "semi-finished": 11,
    "condiment": 12,
}

_RECIPE_DESC_SEP = "\n\n小贴士：\n- "


def _recipe_desc(rec: dict) -> str:
    desc = rec["description"] or ""
    if rec["tips"]:
        tips = _RECIPE_DESC_SEP.join(rec["tips"])
        return f"{desc}\n\n小贴士：\n- {tips}" if desc else f"小贴士：\n- {tips}"
    return desc


def generate_sync_sql(src: Path, limit: int | None = None) -> tuple[list[str], dict]:
    """解析 HowToCook 并生成幂等同步 SQL 语句列表。返回 (statements, stats)。"""
    recs, scanned, parse_errors = collect_records(src, limit)
    stmts: list[str] = []
    stats = {
        "scanned": scanned,
        "parsed": len(recs),
        "categories_insert": 0,
        "dishes_update": 0,
        "dishes_insert": 0,
        "recipes_update": 0,
        "recipes_insert": 0,
        "parse_errors": parse_errors,
    }

    stmts.append("SET NAMES utf8mb4;")

    # 1. 分类（幂等：不存在才插入）
    for cat_dir in HTC_ORDER:
        cfg = HTC_CATEGORIES[cat_dir]
        stmts.append(
            f"INSERT INTO categories (name, icon, sort_order)\n"
            f"SELECT {_q(cfg['name'])}, {_q(cfg['icon'])}, {_CAT_SORT[cat_dir]} FROM DUAL\n"
            f"WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = {_q(cfg['name'])});"
        )
        stats["categories_insert"] += 1

    # 2. 官方账号（菜谱归属）
    stmts.append(
        "INSERT INTO users (nickname, avatar, user_code, is_guest)\n"
        "SELECT '好好吃饭·官方菜谱', '🍽', 'OFFICIAL', 0 FROM DUAL\n"
        "WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_code = 'OFFICIAL');"
    )

    # 3. 菜品 + 4. 公开菜谱
    for rec in recs:
        cat_dir = rec["cat_dir"]
        cfg = HTC_CATEGORIES[cat_dir]
        name = rec["name"]
        cat_sub = _cat_sub(cat_dir)
        dish_sub = _dish_sub(name)
        ingredients = json.dumps(rec["ingredients"], ensure_ascii=False) if rec["ingredients"] else "[]"
        steps = json.dumps(rec["steps"], ensure_ascii=False) if rec["steps"] else "[]"
        recipe_desc = _recipe_desc(rec)

        # 3a. UPDATE 同名菜（不动 price/rating/rating_count）
        stmts.append(
            f"UPDATE dishes SET\n"
            f"  category_id = {cat_sub},\n"
            f"  description = {_q(rec['description'])},\n"
            f"  emoji = {_q(cfg['icon'])}, color = {_q(cfg['color'])},\n"
            f"  image_url = {_q(rec['image_url'])},\n"
            f"  ingredients = {_q(ingredients)}, cook_time = {_q(rec['cook_time'])},\n"
            f"  difficulty = {_q(rec['difficulty'])}, is_active = 1\n"
            f"WHERE name = {_q(name)};"
        )
        stats["dishes_update"] += 1
        # 3b. INSERT 新菜
        stmts.append(
            f"INSERT INTO dishes (category_id, name, price, rating, rating_count, description, emoji, color, image_url, ingredients, cook_time, difficulty, is_active, visibility)\n"
            f"SELECT {cat_sub}, {_q(name)}, {cfg['base_price']}, {DEFAULT_RATING}, {DEFAULT_RATING_COUNT},\n"
            f"       {_q(rec['description'])}, {_q(cfg['icon'])}, {_q(cfg['color'])}, {_q(rec['image_url'])},\n"
            f"       {_q(ingredients)}, {_q(rec['cook_time'])}, {_q(rec['difficulty'])}, 1, 'public'\n"
            f"FROM DUAL\n"
            f"WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE name = {_q(name)});"
        )
        stats["dishes_insert"] += 1

        # 4a. UPDATE 既有公开菜谱
        stmts.append(
            f"UPDATE recipes SET\n"
            f"  dish_id = {dish_sub}, name = {_q(name)},\n"
            f"  emoji = {_q(cfg['icon'])}, color = {_q(cfg['color'])},\n"
            f"  description = {_q(recipe_desc)},\n"
            f"  ingredients = {_q(ingredients)}, steps = {_q(steps)},\n"
            f"  cook_time = {_q(rec['cook_time'])}, difficulty = {_q(rec['difficulty'])},\n"
            f"  image_url = {_q(rec['image_url'])}, category_id = {cat_sub}, is_public = 1\n"
            f"WHERE is_public = 1 AND dish_id = {dish_sub};\n"
        )
        stats["recipes_update"] += 1
        # 4b. INSERT 新公开菜谱（菜必须已存在）
        stmts.append(
            f"INSERT INTO recipes (user_id, dish_id, category_id, name, emoji, color, description, ingredients, steps, cook_time, difficulty, image_url, is_public)\n"
            f"SELECT (SELECT id FROM users WHERE user_code = 'OFFICIAL' LIMIT 1),\n"
            f"       {dish_sub}, {cat_sub}, {_q(name)}, {_q(cfg['icon'])}, {_q(cfg['color'])},\n"
            f"       {_q(recipe_desc)}, {_q(ingredients)}, {_q(steps)},\n"
            f"       {_q(rec['cook_time'])}, {_q(rec['difficulty'])}, {_q(rec['image_url'])}, 1\n"
            f"FROM DUAL\n"
            f"WHERE {dish_sub} IS NOT NULL\n"
            f"  AND NOT EXISTS (SELECT 1 FROM recipes WHERE is_public = 1 AND dish_id = {dish_sub});"
        )
        stats["recipes_insert"] += 1

    return stmts, stats


def render_sql_file(stmts: list[str], stats: dict, src: Path) -> str:
    """拼为可执行 SQL 文件内容（带说明注释）。"""
    head = [
        "-- ===================================================================",
        "-- HowToCook 菜谱同步（幂等，可重复执行）",
        "-- 来源：https://gitee.com/Anduin2017/HowToCook（Unlicense 公有领域）",
        f"-- 生成：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"-- 数据：{stats['scanned']} 篇 md → {stats['parsed']} 道菜",
        "-- 语义：分类/菜品/公开菜谱按菜名幂等 upsert；同名菜保留线上运营价与评分；",
        "--       不删除任何线上数据。执行方式：mysql -u<user> -p good_good_eat < 本文件",
        "-- ===================================================================",
        "",
    ]
    body = "\n\n".join(stmts)
    tail = ["", f"-- 共 {len(stmts)} 条语句（分类 {stats['categories_insert']} / 菜品更新 {stats['dishes_update']} 插入 {stats['dishes_insert']} / 菜谱更新 {stats['recipes_update']} 插入 {stats['recipes_insert']}）"]
    if stats["parse_errors"]:
        tail.append("-- ⚠ 解析失败：" + "；".join(stats["parse_errors"][:5]))
    return "\n".join(head + [body] + tail) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 HowToCook 幂等同步 SQL")
    parser.add_argument("--src", type=Path, default=SERVER_DIR.parent / "HowToCook", help="HowToCook 仓库根目录")
    parser.add_argument("--out", type=Path, default=None, help="输出 SQL 文件（缺省 server/seed/output/howtocook_sync_<ts>.sql）")
    parser.add_argument("--limit", type=int, default=None, help="只处理前 N 篇（调试）")
    args = parser.parse_args()

    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(errors="backslashreplace")

    if not (args.src / "dishes").is_dir():
        print(f"[error] 未找到 {args.src}/dishes，请用 --src 指定 HowToCook 仓库路径")
        sys.exit(1)

    stmts, stats = generate_sync_sql(args.src, limit=args.limit)
    out = args.out or SERVER_DIR / "seed" / "output" / f"howtocook_sync_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_sql_file(stmts, stats, args.src), encoding="utf-8")

    print(f"[export] 完成：{out}")
    print(
        f"[export] 扫描 {stats['scanned']} 篇 → 解析 {stats['parsed']} 道；"
        f"语句 {len(stmts)} 条（分类 {stats['categories_insert']} / "
        f"菜品更新 {stats['dishes_update']} 插入 {stats['dishes_insert']} / "
        f"菜谱更新 {stats['recipes_update']} 插入 {stats['recipes_insert']}）"
    )
    if stats["parse_errors"]:
        print("[export] 解析失败：" + "；".join(stats["parse_errors"][:5]))


if __name__ == "__main__":
    main()