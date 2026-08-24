"""菜谱库模块（四期+最终版）：我的菜谱 + 公开菜谱库 + 菜谱收藏。

- GET    /recipes?owner=me|public|all   分页列表（public 游客可浏览；me/all 需登录）
- GET    /recipes/{recipe_id}           详情（本人或公开可看）
- POST   /recipes                       创建我的菜谱（可 is_public）
- PUT    /recipes/{recipe_id}           编辑自己菜谱（非本人 40301）
- DELETE /recipes/{recipe_id}           删除自己菜谱（非本人 40301）
- POST   /recipes/{recipe_id}/favorite  收藏菜谱
- DELETE /recipes/{recipe_id}/favorite  取消收藏
- GET    /recipes/favorites             我收藏的菜谱列表
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user, get_optional_user
from app.models.dish import Dish
from app.models.recipe import Recipe, RecipeFavorite
from app.models.user import User
from app.schemas.kitchen import RecipeCreateIn
from app.schemas.serializers import recipe_to_dict

router = APIRouter()


def _get_recipe_or_404(db: Session, recipe_id: int) -> Recipe:
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise ApiError(404, 40401, "菜谱不存在")
    return recipe


def _author_map(db: Session, user_ids: list[int]) -> dict[int, str]:
    """user_id → 昵称（批量，公开菜谱库展示作者）。"""
    ids = list(set(user_ids))
    if not ids:
        return {}
    rows = db.execute(select(User.id, User.nickname).where(User.id.in_(ids))).all()
    return {r[0]: r[1] for r in rows}


def _favorites_set(db: Session, user_id: int, recipe_ids: list[int]) -> set[int]:
    """当前用户已收藏的 recipe_id 集合。"""
    if not recipe_ids or user_id is None:
        return set()
    rows = db.execute(
        select(RecipeFavorite.recipe_id).where(
            RecipeFavorite.user_id == user_id,
            RecipeFavorite.recipe_id.in_(recipe_ids),
        )
    ).all()
    return {r[0] for r in rows}


def _can_view(recipe: Recipe, user: User | None) -> bool:
    """能看：公开，或本人。"""
    return recipe.is_public or (user is not None and recipe.user_id == user.id)


@router.get("/recipes")
def list_recipes(
    owner: str = "me",
    page: int = 1,
    page_size: int = 20,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜谱分页列表（created_at 倒序）。

    - owner=public：公开菜谱（is_public=1），游客可浏览
    - owner=me：当前用户自己的菜谱（需登录）
    - owner=all：自己的 + 公开的（需登录）
    """
    if owner not in ("me", "public", "all"):
        raise ApiError(400, 40000, "owner 仅支持 me|public|all")

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    if owner == "public":
        conds = [Recipe.is_public.is_(True)]
    elif owner == "all":
        if user is None:
            raise ApiError(401, 40140, "请先登录")
        conds = [or_(Recipe.user_id == user.id, Recipe.is_public.is_(True))]
    else:  # me
        if user is None:
            raise ApiError(401, 40140, "请先登录")
        conds = [Recipe.user_id == user.id]

    total = db.scalar(select(func.count(Recipe.id)).where(*conds)) or 0
    recipes = db.scalars(
        select(Recipe)
        .where(*conds)
        .order_by(Recipe.created_at.desc(), Recipe.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    authors = _author_map(db, [r.user_id for r in recipes])
    favs = _favorites_set(db, user.id, [r.id for r in recipes]) if user else set()

    items = [
        recipe_to_dict(
            r,
            with_owner=True,
            author_name=authors.get(r.user_id),
            is_favorite=r.id in favs,
        )
        for r in recipes
    ]

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
    )


@router.get("/recipes/favorites")
def list_recipe_favorites(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我收藏的菜谱列表（created_at 倒序）。"""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = [RecipeFavorite.user_id == user.id]
    total = db.scalar(select(func.count(RecipeFavorite.id)).where(*conds)) or 0
    favs = db.scalars(
        select(RecipeFavorite)
        .where(*conds)
        .options(joinedload(RecipeFavorite.recipe))
        .order_by(RecipeFavorite.created_at.desc(), RecipeFavorite.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = []
    rcps = [f.recipe for f in favs if f.recipe is not None]
    authors = _author_map(db, [r.user_id for r in rcps])
    for f in favs:
        r = f.recipe
        if r is None:
            continue
        items.append(
            recipe_to_dict(
                r,
                with_owner=True,
                author_name=authors.get(r.user_id),
                is_favorite=True,
            )
        )

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
    )


@router.get("/recipes/by-dish/{dish_id}")
def recipe_by_dish(
    dish_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜品的公开菜谱（菜单菜品 → 菜谱库跳转）；无公开菜谱返回 data=null。"""
    dish = db.get(Dish, dish_id)
    if dish is None or not dish.is_active:
        raise ApiError(404, 40401, "菜品不存在或已下架")
    recipe = db.scalar(
        select(Recipe).where(Recipe.dish_id == dish_id, Recipe.is_public.is_(True)).limit(1)
    )
    if recipe is None:
        return ok(None)
    author_name = db.scalar(select(User.nickname).where(User.id == recipe.user_id).limit(1))
    is_fav = False
    if user is not None:
        is_fav = (
            db.scalar(
                select(RecipeFavorite.id)
                .where(RecipeFavorite.user_id == user.id, RecipeFavorite.recipe_id == recipe.id)
                .limit(1)
            )
            is not None
        )
    return ok(recipe_to_dict(recipe, with_owner=True, author_name=author_name, is_favorite=is_fav))


@router.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> dict:
    """菜谱详情；本人或 is_public 可看，否则 40301。"""
    recipe = _get_recipe_or_404(db, recipe_id)
    if not _can_view(recipe, user):
        raise ApiError(403, 40301, "无权查看该菜谱")
    author_name = db.scalar(select(User.nickname).where(User.id == recipe.user_id).limit(1))
    is_fav = False
    if user is not None:
        is_fav = (
            db.scalar(
                select(RecipeFavorite.id)
                .where(RecipeFavorite.user_id == user.id, RecipeFavorite.recipe_id == recipe_id)
                .limit(1)
            )
            is not None
        )
    return ok(
        recipe_to_dict(
            recipe,
            with_owner=True,
            author_name=author_name,
            is_favorite=is_fav,
        )
    )


@router.post("/recipes/{recipe_id}/favorite")
def favorite_recipe(
    recipe_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """收藏菜谱（本人或公开可收藏）；已收藏则幂等返回。"""
    recipe = _get_recipe_or_404(db, recipe_id)
    if not _can_view(recipe, user):
        raise ApiError(403, 40301, "无权收藏该菜谱")
    exists = db.scalar(
        select(RecipeFavorite)
        .where(RecipeFavorite.user_id == user.id, RecipeFavorite.recipe_id == recipe_id)
        .limit(1)
    )
    if exists is None:
        db.add(RecipeFavorite(user_id=user.id, recipe_id=recipe_id))
        db.commit()
    return ok({"recipe_id": recipe_id, "favorited": True})


@router.delete("/recipes/{recipe_id}/favorite")
def unfavorite_recipe(
    recipe_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """取消收藏；未收藏抛 40022。"""
    fav = db.scalar(
        select(RecipeFavorite)
        .where(RecipeFavorite.user_id == user.id, RecipeFavorite.recipe_id == recipe_id)
        .limit(1)
    )
    if fav is None:
        raise ApiError(400, 40022, "尚未收藏该菜谱")
    db.delete(fav)
    db.commit()
    return ok({"recipe_id": recipe_id, "favorited": False})


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
    return ok(recipe_to_dict(recipe, with_owner=True, author_name=user.nickname, is_favorite=False))


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
    return ok(recipe_to_dict(recipe, with_owner=True, author_name=user.nickname))


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
