"""菜谱库模块（四期）：我的菜谱增删改查。本期公开菜谱库后置，仅做 owner=me。"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.kitchen import RecipeCreateIn
from app.schemas.serializers import recipe_to_dict

router = APIRouter()


def _get_recipe_or_404(db: Session, recipe_id: int) -> Recipe:
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise ApiError(404, 40401, "菜谱不存在")
    return recipe


@router.get("/recipes")
def list_recipes(
    owner: str = "me",
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的菜谱分页列表（created_at 倒序）。本期仅支持 owner=me。"""
    if owner != "me":
        raise ApiError(400, 40020, "公开菜谱库暂未开放，仅支持查看我的菜谱")
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = [Recipe.user_id == user.id]
    total = db.scalar(select(func.count(Recipe.id)).where(*conds)) or 0
    recipes = db.scalars(
        select(Recipe)
        .where(*conds)
        .order_by(Recipe.created_at.desc(), Recipe.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [recipe_to_dict(r, with_owner=True) for r in recipes],
        }
    )


@router.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜谱详情；本人或 is_public 可看，否则 40301。"""
    recipe = _get_recipe_or_404(db, recipe_id)
    if recipe.user_id != user.id and not recipe.is_public:
        raise ApiError(403, 40301, "无权查看该菜谱")
    return ok(recipe_to_dict(recipe, with_owner=True))


@router.post("/recipes")
def create_recipe(
    body: RecipeCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建菜谱（user_id=当前用户）。"""
    recipe = Recipe(
        user_id=user.id,
        name=body.name.strip(),
        emoji=body.emoji.strip() or "🍽",
        color=body.color.strip() or "#4CAF50",
        description=body.description,
        ingredients=json.dumps(body.ingredients, ensure_ascii=False),
        steps=json.dumps(body.steps, ensure_ascii=False),
        cook_time=body.cook_time,
        difficulty=body.difficulty,
        image_url=body.image_url,
        is_public=body.is_public,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return ok(recipe_to_dict(recipe, with_owner=True))


@router.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: int,
    body: RecipeCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """编辑自己菜谱；非本人 40301。"""
    recipe = _get_recipe_or_404(db, recipe_id)
    if recipe.user_id != user.id:
        raise ApiError(403, 40301, "无权编辑他人菜谱")
    recipe.name = body.name.strip()
    recipe.emoji = body.emoji.strip() or "🍽"
    recipe.color = body.color.strip() or "#4CAF50"
    recipe.description = body.description
    recipe.ingredients = json.dumps(body.ingredients, ensure_ascii=False)
    recipe.steps = json.dumps(body.steps, ensure_ascii=False)
    recipe.cook_time = body.cook_time
    recipe.difficulty = body.difficulty
    recipe.image_url = body.image_url
    recipe.is_public = body.is_public
    db.commit()
    db.refresh(recipe)
    return ok(recipe_to_dict(recipe, with_owner=True))


@router.delete("/recipes/{recipe_id}")
def delete_recipe(
    recipe_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """删除自己菜谱；非本人 40301。"""
    recipe = _get_recipe_or_404(db, recipe_id)
    if recipe.user_id != user.id:
        raise ApiError(403, 40301, "无权删除他人菜谱")
    db.delete(recipe)
    db.commit()
    return ok({"id": recipe_id})
