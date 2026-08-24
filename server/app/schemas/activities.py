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
