"""v1 路由汇总：认证 / 菜品 / 团队 / 订单 / 消息 / 厨师看板。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, chef, dishes, messages, orders, teams

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(teams.router)
api_router.include_router(dishes.router)
api_router.include_router(orders.router)
api_router.include_router(messages.router)
api_router.include_router(chef.router)