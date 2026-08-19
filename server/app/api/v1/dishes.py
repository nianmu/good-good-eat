"""菜品模块（M2.3）：分类列表 / 菜品列表搜索分页 / 菜品详情。

五期新增（随机点菜加强）：
- GET /dishes/random?n=&type=balanced|surprise|nutrition —— 聪明随机推荐
- GET /dishes/recommend?people=n —— 按人数推荐一轮饭搭配
"""

from __future__ import annotations

import random

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.models.dish import Category, Dish
from app.schemas.serializers import category_to_dict, dish_to_dict

router = APIRouter()

# 分类名 → 营养类型映射（对齐种子 6 类）。
# 营养类型：meat 荤菜(蛋白质) / veg 素菜(纤维) / energy 能量补给(碳水) / soup 汤 / staple 主食 / cold 凉菜
_CATEGORY_ROLE = {
    "荤菜": "meat",
    "蔬菜也要吃呀": "veg",
    "美味能量补给": "energy",
    "饭后最后一口汤": "soup",
    "主食": "staple",
    "凉菜": "cold",
}
_ROLE_LABEL = {"meat": "荤菜", "veg": "素菜", "energy": "能量", "soup": "汤", "staple": "主食", "cold": "凉菜"}


def _role_map(db: Session) -> dict[int, str]:
    """category_id → 营养类型。"""
    cats = db.scalars(select(Category)).all()
    return {c.id: _CATEGORY_ROLE.get(c.name, "other") for c in cats}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> dict:
    """分类列表（按 sort_order 升序）。"""
    categories = db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all()
    return ok([category_to_dict(c) for c in categories])


@router.get("/dishes")
def list_dishes(
    category_id: int | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
) -> dict:
    """菜品列表/搜索（仅 is_active），keyword 匹配 name/description/ingredients。

    性能说明（五期）：keyword 使用 LIKE 命中 name/description/ingredients 三列，
    已为高频筛选列 category_id 建立索引（见分页脚本），数据量小时 LIKE 足够；
    若未来菜品量级增长，可在此处换用 MySQL FULLTEXT（NGRAM 分词）进一步提升。
    """
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = [Dish.is_active.is_(True)]
    if category_id is not None:
        conds.append(Dish.category_id == category_id)
    if keyword:
        kw = f"%{keyword.strip()}%"
        conds.append(
            or_(Dish.name.like(kw), Dish.description.like(kw), Dish.ingredients.like(kw))
        )

    total = db.scalar(select(func.count(Dish.id)).where(*conds)) or 0
    dishes = db.scalars(
        select(Dish)
        .where(*conds)
        .order_by(Dish.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [dish_to_dict(d) for d in dishes],
        }
    )


def _shuffle(seq: list) -> list:
    """洗牌（返回新列表，不改原对象）。"""
    arr = seq[:]
    random.shuffle(arr)
    return arr


def _active_dishes(db: Session) -> list[Dish]:
    """全部在售菜品（按 id 稳定序，供随机/组合逻辑复用）。"""
    return db.scalars(select(Dish).where(Dish.is_active.is_(True)).order_by(Dish.id)).all()


def _pick_n(pool: list, n: int) -> list:
    """从池子洗牌取 n 个；不足时返回全部。"""
    if n <= 0:
        return []
    shuffled = _shuffle(pool)
    return shuffled[: min(n, len(pool))]


def _balanced_plan(db: Session, n: int) -> list[Dish]:
    """均衡：从荤/素/汤/能量等各类各抽 1 道，直到凑满 n，保证荤素汤搭配。"""
    roles = _role_map(db)
    grouped: dict[str, list[Dish]] = {}
    for d in _active_dishes(db):
        grouped.setdefault(roles.get(d.category_id, "other"), []).append(d)

    # 每类各抽 1 道，按 荤/素/汤/能量/主食/凉菜 顺序轮转填充到 n
    priority = ["meat", "veg", "soup", "energy", "staple", "cold"]
    picks: list[Dish] = []
    seen: set[int] = set()
    idx = 0
    while len(picks) < n and priority:
        role = priority[idx % len(priority)]
        candidates = [d for d in grouped.get(role, []) if d.id not in seen]
        if candidates:
            chosen = random.choice(candidates)
            seen.add(chosen.id)
            picks.append(chosen)
        idx += 1
    return picks


def _nutrition_score(d: Dish, roles: dict[int, str]) -> int:
    """按营养类型打分（越高越优先命中营养均衡）。"""
    role = roles.get(d.category_id, "other")
    # 荤=蛋白质 / 素=纤维 / 能量=碳水，配主食与汤构成均衡组合
    base = {"meat": 3, "veg": 3, "energy": 3, "soup": 2, "staple": 2, "cold": 1}.get(role, 0)
    return base + int(round(float(d.rating) * 2))


def _nutrition_plan(db: Session, n: int) -> list[Dish]:
    """营养：按类型打分，优先命中 荤+素+能量 的均衡组合。"""
    roles = _role_map(db)
    active = _active_dishes(db)
    scored = sorted(active, key=lambda d: _nutrition_score(d, roles), reverse=True)

    picks: list[Dish] = []
    seen: set[int] = set()
    pick_roles: set[str] = set()
    for d in scored:
        if len(picks) >= n:
            break
        if d.id in seen:
            continue
        role = roles.get(d.category_id, "other")
        # 荤/素/能量（蛋白质/纤维/碳水）各先取一个，凑够核心均衡组合
        if role in ("meat", "veg", "energy") and role not in pick_roles and len(picks) < n:
            seen.add(d.id)
            pick_roles.add(role)
            picks.append(d)
    if len(picks) < n:
        for d in scored:
            if len(picks) >= n:
                break
            if d.id in seen:
                continue
            seen.add(d.id)
            picks.append(d)
    return picks


@router.get("/dishes/random")
def random_dishes(
    n: int = Query(default=3, ge=1, le=100),
    type: str = Query(default="balanced", pattern="^(balanced|surprise|nutrition)$"),
    db: Session = Depends(get_db),
) -> dict:
    """聪明随机点菜。

    - balanced 均衡：从荤/素/汤各类各抽，保证搭配
    - surprise 惊喜：全库乱序抽 n
    - nutrition 营养：按类型打分优先均衡组合
    返回 [dish,...] 数量 n（不足时按现有菜品返回）。
    """
    if type == "surprise":
        returns = _pick_n(_active_dishes(db), n)
    elif type == "nutrition":
        returns = _nutrition_plan(db, n)
    else:  # balanced
        returns = _balanced_plan(db, n)
    return ok([dish_to_dict(d) for d in returns])


@router.get("/dishes/recommend")
def recommend_dishes(
    people: int = Query(default=3, ge=1, le=20),
    db: Session = Depends(get_db),
) -> dict:
    """按人数推荐一轮饭搭配。

    组合：荤 n/2、素 n/2、汤 1、主食 1（向上取整），返回
    { plan: [dish,...], reason: '按 N 人：X 荤 X 素 X 汤 X 主食' }
    """
    meat_n = max(1, (people + 1) // 2)
    veg_n = max(1, (people + 1) // 2)
    soup_n = 1
    staple_n = 1

    roles = _role_map(db)
    grouped: dict[str, list[Dish]] = {}
    for d in _active_dishes(db):
        grouped.setdefault(roles.get(d.category_id, "other"), []).append(d)

    picks: list[Dish] = []
    seen: set[int] = set()
    for role, need in (("meat", meat_n), ("veg", veg_n), ("soup", soup_n), ("staple", staple_n)):
        for d in _shuffle(grouped.get(role, [])):
            if need <= 0:
                break
            if d.id in seen:
                continue
            seen.add(d.id)
            picks.append(d)
            need -= 1

    reason = f"按 {people} 人：{meat_n} 荤 {veg_n} 素 {soup_n} 汤 {staple_n} 主食"
    return ok({"plan": [dish_to_dict(d) for d in picks], "reason": reason})


@router.get("/dishes/{dish_id}")
def get_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    """菜品详情；不存在或已下架抛 40401。"""
    dish = db.get(Dish, dish_id)
    if dish is None or not dish.is_active:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    return ok(dish_to_dict(dish))