"""菜品模块（M2.3）：分类列表 / 菜品列表搜索分页 / 菜品详情。

五期新增（随机点菜加强）：
- GET /dishes/random?n=&type=balanced|surprise|nutrition —— 聪明随机推荐
- GET /dishes/recommend?people=n —— 按人数推荐一轮饭搭配

新增（自建菜品 + 可见性）：
- POST /dishes —— 用户新建菜品（public/team/private 三态 + recipe 一键建菜谱）
- PUT /dishes/{id} —— 编辑自建菜品（含可见性）
- 所有读菜入口按可见性过滤（游客只见 public；登录见 public + 自己的 private + 所在团队 team 菜）
"""

from __future__ import annotations

import json
import random

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user, get_optional_user
from app.models.dish import Category, Dish
from app.models.recipe import Recipe
from app.models.user import TeamMember, User
from app.schemas.kitchen import DishCreateIn, DishEditIn
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


# ─────────────────────── 可见性（全模块共享）───────────────────────


def visible_dish_conds(db: Session, user: User | None) -> list:
    """当前用户可见的菜品条件（含 is_active）。游客只见 public；
    登录用户见 public + 自己的 private + 所在团队 team 菜（动态跟随 team_members）。"""
    conds = [Dish.is_active.is_(True)]
    if user is None:
        conds.append(Dish.visibility == "public")
        return conds
    clauses = [(Dish.visibility == "public"), (Dish.visibility == "private") & (Dish.created_by == user.id)]
    team_ids = db.scalars(
        select(TeamMember.team_id).where(TeamMember.user_id == user.id)
    ).all()
    if team_ids:
        clauses.append((Dish.visibility == "team") & Dish.team_id.in_(team_ids))
    conds.append(or_(*clauses))
    return conds


def visible_dish(db: Session, dish_id: int, user: User | None) -> Dish | None:
    """按可见性取单个在售菜品；不可见返回 None（调用方决定 404 语义）。"""
    dish = db.scalar(select(Dish).where(Dish.id == dish_id, *visible_dish_conds(db, user)).limit(1))
    return dish


def _visible_dish_or_404(db: Session, dish_id: int, user: User | None) -> Dish:
    dish = visible_dish(db, dish_id, user)
    if dish is None:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    return dish


def _can_manage_dish(dish: Dish, user: User) -> bool:
    """自建菜品编辑权：仅创建者（平台菜不可编辑）。"""
    return dish.created_by is not None and dish.created_by == user.id


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> dict:
    """分类列表（按 sort_order 升序）。"""
    categories = db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all()
    return ok([category_to_dict(c) for c in categories])


@router.get("/dishes")
def list_dishes(
    category_id: int | None = None,
    keyword: str | None = None,
    mine: int = 0,
    page: int = 1,
    page_size: int = 20,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜品列表/搜索（仅当前用户可见，含 is_active），keyword 匹配 name/description/ingredients。

    可见性：游客只见 public；登录用户见 public + 自己的 private + 所在团队 team 菜。
    mine=1 时只看自己创建的（登录用户）。

    性能说明（五期）：keyword 使用 LIKE 命中 name/description/ingredients 三列，
    已为高频筛选列 category_id 建立索引（见分页脚本），数据量小时 LIKE 足够；
    若未来菜品量级增长，可在此处换用 MySQL FULLTEXT（NGRAM 分词）进一步提升。
    """
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = visible_dish_conds(db, user)
    if mine and user is not None:
        conds.append(Dish.created_by == user.id)
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


@router.post("/dishes")
def create_dish(
    body: DishCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """用户新建菜品（登录）。可见性三态：public / team（必填 team_id 且为成员）/ private。
    recipe 可选：同时创建关联菜谱（dish_id 绑定，B 方案"一道菜=一份做法"）。"""
    if db.get(Category, body.category_id) is None:
        raise ApiError(400, 40000, "分类不存在")
    if body.visibility == "team":
        if body.team_id is None:
            raise ApiError(400, 40000, "团队公开菜品必须指定团队")
        member = db.scalar(
            select(TeamMember.id).where(TeamMember.team_id == body.team_id, TeamMember.user_id == user.id)
        )
        if member is None:
            raise ApiError(400, 40002, "只能发布到自己所在的团队")

    dish = Dish(
        category_id=body.category_id,
        name=body.name.strip(),
        price=body.price,
        emoji=body.emoji.strip() or "🍽",
        color=body.color.strip() or "#4CAF50",
        description=body.description,
        ingredients=json.dumps(body.ingredients, ensure_ascii=False),
        cook_time=body.cook_time,
        difficulty=body.difficulty,
        is_active=True,
        created_by=user.id,
        visibility=body.visibility,
        team_id=body.team_id if body.visibility == "team" else None,
    )
    db.add(dish)
    db.flush()

    recipe_id: int | None = None
    if body.recipe is not None:
        r = body.recipe
        recipe = Recipe(
            user_id=user.id,
            dish_id=dish.id,
            category_id=dish.category_id,
            name=r.name.strip() or dish.name,
            emoji=r.emoji.strip() or dish.emoji,
            color=r.color.strip() or dish.color,
            description=r.description,
            ingredients=json.dumps(r.ingredients, ensure_ascii=False) or dish.ingredients,
            steps=json.dumps(r.steps, ensure_ascii=False),
            cook_time=r.cook_time,
            difficulty=r.difficulty,
            image_url=r.image_url,
            is_public=r.is_public,
        )
        db.add(recipe)
        db.flush()
        recipe_id = recipe.id

    db.commit()
    db.refresh(dish)
    return ok({**dish_to_dict(dish), "recipe_id": recipe_id})


@router.put("/dishes/{dish_id}")
def edit_dish(
    dish_id: int,
    body: DishEditIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """编辑自建菜品（仅创建者；允许修改可见性）。team 时 team_id 必填且为成员。"""
    dish = db.get(Dish, dish_id)
    if dish is None or not dish.is_active:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    if not _can_manage_dish(dish, user):
        raise ApiError(403, 40301, "仅创建者可编辑该菜品")

    data = body.model_dump(exclude_unset=True)
    visibility = data.pop("visibility", None)
    team_id = data.pop("team_id", None)
    if visibility is not None and visibility != dish.visibility:
        if visibility == "team":
            if team_id is None:
                raise ApiError(400, 40000, "团队公开菜品必须指定团队")
            if db.scalar(
                select(TeamMember.id).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
            ) is None:
                raise ApiError(400, 40002, "只能发布到自己所在的团队")
        dish.visibility = visibility
        dish.team_id = team_id if visibility == "team" else None
    elif team_id is not None:
        dish.team_id = team_id

    if "name" in data and data["name"] is not None:
        dish.name = data["name"].strip()
    if "emoji" in data and data["emoji"] is not None:
        dish.emoji = data["emoji"].strip() or "🍽"
    if "color" in data and data["color"] is not None:
        dish.color = data["color"].strip() or "#4CAF50"
    if "description" in data and data["description"] is not None:
        dish.description = data["description"]
    if "price" in data and data["price"] is not None:
        dish.price = data["price"]
    if "ingredients" in data and data["ingredients"] is not None:
        dish.ingredients = json.dumps(data["ingredients"], ensure_ascii=False)
    if "cook_time" in data:
        dish.cook_time = data["cook_time"]
    if "difficulty" in data:
        dish.difficulty = data["difficulty"]

    db.commit()
    db.refresh(dish)
    return ok(dish_to_dict(dish))


def _shuffle(seq: list) -> list:
    """洗牌（返回新列表，不改原对象）。"""
    arr = seq[:]
    random.shuffle(arr)
    return arr


def _active_dishes(db: Session, user: User | None = None) -> list[Dish]:
    """当前用户可见的全部在售菜品（按 id 稳定序，供随机/组合逻辑复用）。"""
    return db.scalars(select(Dish).where(*visible_dish_conds(db, user)).order_by(Dish.id)).all()


def _pick_n(pool: list, n: int) -> list:
    """从池子洗牌取 n 个；不足时返回全部。"""
    if n <= 0:
        return []
    shuffled = _shuffle(pool)
    return shuffled[: min(n, len(pool))]


def _balanced_plan_from(active: list[Dish], n: int, roles: dict[int, str]) -> list[Dish]:
    """均衡：从荤/素/汤/能量等各类各抽 1 道，直到凑满 n，保证荤素汤搭配。"""
    grouped: dict[str, list[Dish]] = {}
    for d in active:
        grouped.setdefault(roles.get(d.category_id, "other"), []).append(d)

    # 每类各抽 1 道，按 荤/素/汤/能量/主食/凉菜 顺序轮转填充到 n；
    # 候选耗尽（active 不足 n）时提前退出，避免 n > 池小时死循环
    priority = ["meat", "veg", "soup", "energy", "staple", "cold"]
    picks: list[Dish] = []
    seen: set[int] = set()
    idx = 0
    while len(picks) < n and len(picks) < len(active):
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


def _nutrition_plan_from(active: list[Dish], n: int, roles: dict[int, str]) -> list[Dish]:
    """营养：按类型打分，优先命中 荤+素+能量 的均衡组合。"""
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
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """聪明随机点菜（只从当前用户可见池抽取）。

    - balanced 均衡：从荤/素/汤各类各抽，保证搭配
    - surprise 惊喜：全库乱序抽 n
    - nutrition 营养：按类型打分优先均衡组合
    返回 [dish,...] 数量 n（不足时按现有菜品返回）。
    """
    active = _active_dishes(db, user)
    roles = _role_map(db)
    if type == "surprise":
        returns = _pick_n(active, n)
    elif type == "nutrition":
        returns = _nutrition_plan_from(active, n, roles)
    else:  # balanced
        returns = _balanced_plan_from(active, n, roles)
    return ok([dish_to_dict(d) for d in returns])


@router.get("/dishes/recommend")
def recommend_dishes(
    people: int = Query(default=3, ge=1, le=20),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """按人数推荐一轮饭搭配（只从当前用户可见池抽取）。

    组合：荤 n/2、素 n/2、汤 1、主食 1（向上取整），返回
    { plan: [dish,...], reason: '按 N 人：X 荤 X 素 X 汤 X 主食' }
    """
    meat_n = max(1, (people + 1) // 2)
    veg_n = max(1, (people + 1) // 2)
    soup_n = 1
    staple_n = 1

    roles = _role_map(db)
    active = _active_dishes(db, user)
    grouped: dict[str, list[Dish]] = {}
    for d in active:
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
def get_dish(
    dish_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜品详情；不存在、已下架或对当前用户不可见抛 40401。"""
    dish = _visible_dish_or_404(db, dish_id, user)
    return ok(dish_to_dict(dish))