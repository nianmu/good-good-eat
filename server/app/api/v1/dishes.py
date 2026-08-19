"""菜品模块（M2.3）：分类列表 / 菜品列表搜索分页 / 菜品详情。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.models.dish import Category, Dish
from app.schemas.serializers import category_to_dict, dish_to_dict

router = APIRouter()


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
    """菜品列表/搜索（仅 is_active），keyword 匹配 name/description/ingredients。"""
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


@router.get("/dishes/{dish_id}")
def get_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    """菜品详情；不存在或已下架抛 40401。"""
    dish = db.get(Dish, dish_id)
    if dish is None or not dish.is_active:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    return ok(dish_to_dict(dish))