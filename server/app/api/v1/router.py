"""v1 路由汇总：认证 / 菜品 / 团队 / 活动 / 收藏 / 菜谱 / 厨房 / 计划。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    activities,
    auth,
    basket,
    dishes,
    favorites,
    fridge,
    media,
    plans,
    recipes,
    teams,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(teams.router)
api_router.include_router(dishes.router)
api_router.include_router(favorites.router)
api_router.include_router(recipes.router)
api_router.include_router(fridge.router)
api_router.include_router(basket.router)
api_router.include_router(plans.router)
api_router.include_router(activities.router)
api_router.include_router(media.router)