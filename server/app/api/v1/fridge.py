"""厨房冰箱模块（四期）增删改查 + 「冰箱能做的菜」推荐。"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.dish import Dish
from app.models.fridge import FridgeItem
from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.kitchen import FridgeUpsertIn
from app.schemas.serializers import fridge_item_to_dict

router = APIRouter()


@router.get("/fridge")
def list_fridge(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的冰箱食材列表（按名称排序）。"""
    items = db.scalars(
        select(FridgeItem)
        .where(FridgeItem.user_id == user.id)
        .order_by(FridgeItem.name)
    ).all()
    return ok([fridge_item_to_dict(i) for i in items])


@router.post("/fridge")
def upsert_fridge(
    body: FridgeUpsertIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """添加冰箱食材；同名覆盖 quantity。"""
    name = body.name.strip()
    existing = db.scalar(
        select(FridgeItem)
        .where(FridgeItem.user_id == user.id, FridgeItem.name == name)
        .limit(1)
    )
    if existing is None:
        item = FridgeItem(user_id=user.id, name=name, quantity=body.quantity)
        db.add(item)
        db.commit()
        db.refresh(item)
        return ok(fridge_item_to_dict(item))
    existing.quantity = body.quantity
    db.commit()
    db.refresh(existing)
    return ok(fridge_item_to_dict(existing))


@router.delete("/fridge/{item_id}")
def delete_fridge(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """删除冰箱食材；不存在 40401。"""
    item = db.get(FridgeItem, item_id)
    if item is None or item.user_id != user.id:
        raise ApiError(404, 40401, "冰箱食材不存在")
    db.delete(item)
    db.commit()
    return ok({"id": item_id})


@router.get("/fridge/suggest")
def fridge_suggest(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """冰箱能做的菜推荐：遍历公开/我的菜谱与平台菜品，命中食材数≥2 返回，按命中数降序。"""
    owned = {f.name for f in db.scalars(select(FridgeItem).where(FridgeItem.user_id == user.id)).all()}
    if not owned:
        return ok([])

    results: list[dict] = []

    # 平台/可见菜品（is_active + 当前用户可见性）
    from app.api.v1.dishes import visible_dish_conds

    dishes = db.scalars(select(Dish).where(*visible_dish_conds(db, user)).order_by(Dish.id)).all()
    for d in dishes:
        ingredients = _parse_json_arr(d.ingredients)
        matched = [i for i in ingredients if i in owned]
        if len(matched) >= 2:
            results.append(
                {
                    "source": "dish",
                    "id": d.id,
                    "name": d.name,
                    "emoji": d.emoji,
                    "color": d.color,
                    "description": d.description,
                    "ingredients": ingredients,
                    "matched": matched,
                    "total": len(ingredients),
                }
            )

    # 我的菜谱 + 公开菜谱
    recipes = db.scalars(
        select(Recipe).where((Recipe.user_id == user.id) | (Recipe.is_public.is_(True)))
    ).all()
    seen_recipe_ids: set[int] = set()
    for r in recipes:
        if r.id in seen_recipe_ids:
            continue
        seen_recipe_ids.add(r.id)
        ingredients = _parse_json_arr(r.ingredients)
        matched = [i for i in ingredients if i in owned]
        if len(matched) >= 2:
            results.append(
                {
                    "source": "recipe",
                    "id": r.id,
                    "name": r.name,
                    "emoji": r.emoji,
                    "color": r.color,
                    "description": r.description,
                    "ingredients": ingredients,
                    "matched": matched,
                    "total": len(ingredients),
                }
            )

    results.sort(key=lambda x: len(x["matched"]), reverse=True)
    return ok(results)


def _parse_json_arr(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []
