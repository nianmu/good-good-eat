"""订单相关请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OrderItemIn(BaseModel):
    """下单菜品项。"""

    dish_id: int
    quantity: int = Field(ge=1, le=999)


class OrderCreateIn(BaseModel):
    """创建订单请求。"""

    team_id: int
    items: list[OrderItemIn] = Field(min_length=1)


class OrderStatusIn(BaseModel):
    """状态流转目标。"""

    status: str = Field(min_length=1, max_length=16)