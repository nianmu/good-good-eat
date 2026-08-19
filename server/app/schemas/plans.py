"""五期「饮食计划 / 随机推荐」相关请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PlanItemIn(BaseModel):
    """计划内菜品项。"""

    dish_id: int
    quantity: int = Field(ge=1, le=999)


class PlanCreateIn(BaseModel):
    """保存我的饮食计划。"""

    name: str = Field(min_length=1, max_length=64)
    note: str = Field(default="", max_length=1000)
    items: list[PlanItemIn] = Field(default_factory=list)
