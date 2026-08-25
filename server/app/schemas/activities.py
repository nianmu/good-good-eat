"""活动请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ActivityCreateIn(BaseModel):
    """创建活动请求：team_id 必选，type 枚举，name 非空。"""

    team_id: int = Field(description="所属团队 id")
    type: str = Field(description="活动类型 daily|party")
    name: str = Field(min_length=1, max_length=64, description="活动名称")
    people: int | None = Field(default=None, ge=1, le=999, description="人数")
    remark: str | None = Field(default=None, max_length=1000, description="备注")


class ActivityStatusIn(BaseModel):
    """活动状态流转目标。"""

    target: str = Field(min_length=1, max_length=16, description="目标状态 ordering|preparing|cooking|completed")


class ActivityItemCreateIn(BaseModel):
    """点菜请求。"""

    dish_id: int = Field(description="菜品 id")
    quantity: int = Field(ge=1, le=999, description="数量 1-999")


class ActivityItemChefIn(BaseModel):
    """改厨师请求。"""

    user_id: int | None = Field(default=None, description="厨师用户 id，null 回落团队固定厨师")


class ActivityItemStatusIn(BaseModel):
    """单菜进度目标。"""

    target: str = Field(min_length=1, max_length=16, description="目标状态 pending|prepared|cooking|done")


class IngredientReadyIn(BaseModel):
    """食材备齐状态切换。"""

    is_ready: bool = Field(description="是否备齐")
