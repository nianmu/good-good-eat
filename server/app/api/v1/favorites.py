"""收藏模块（四期）：收藏 / 取消收藏 / 我的收藏列表。收藏针对菜品（Dish）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.api.v1.dishes import visible_dish
from app.models.dish import Dish
from app.models.favorite import Favorite
from app.models.user import User
from app.schemas.serializers import dish_to_dict

router = APIRouter()


def _get_active_dish(db: Session, dish_id: int, user: User) -> Dish:
    """加载当前用户可见的在售菜品；不存在/下架/不可见抛 40401（收藏复用此接口时也校验）。"""
    dish = visible_dish(db, dish_id, user)
    if dish is None:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    return dish


@router.post("/dishes/{dish_id}/favorite")
def favorite_dish(
    dish_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """收藏菜品；已收藏则幂等返回当前态。仅当前用户可见的菜可收藏。"""
    _get_active_dish(db, dish_id, user)
    exists = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.dish_id == dish_id).limit(1)
    )
    if exists is None:
        db.add(Favorite(user_id=user.id, dish_id=dish_id))
        db.commit()
    return ok({"dish_id": dish_id, "favorited": True})


@router.delete("/dishes/{dish_id}/favorite")
def unfavorite_dish(
    dish_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """取消收藏；未收藏抛 40022。"""
    fav = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.dish_id == dish_id).limit(1)
    )
    if fav is None:
        raise ApiError(400, 40022, "尚未收藏该菜品")
    db.delete(fav)
    db.commit()
    return ok({"dish_id": dish_id, "favorited": False})


@router.get("/favorites")
def list_favorites(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我收藏的菜品分页列表（含菜品完整信息，created_at 倒序；按当前用户可见性过滤）。

    total 与 items 同源：可见性过滤在 SQL 中完成（join Dish），
    避免先 count 全量再逐条过滤导致 total 与实际条数不一致。
    """
    from app.api.v1.dishes import visible_dish_conds

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    vis_conds = visible_dish_conds(db, user)
    base_conds = [Favorite.user_id == user.id, *vis_conds]

    total = (
        db.scalar(
            select(func.count(Favorite.id))
            .join(Dish, Favorite.dish_id == Dish.id)
            .where(*base_conds)
        )
        or 0
    )
    favors = db.scalars(
        select(Favorite)
        .join(Dish, Favorite.dish_id == Dish.id)
        .where(*base_conds)
        .options(joinedload(Favorite.dish))
        .order_by(Favorite.created_at.desc(), Favorite.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = []
    for f in favors:
        dish = f.dish
        if dish is None or not dish.is_active:
            continue
        items.append(dish_to_dict(dish))

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
    )
