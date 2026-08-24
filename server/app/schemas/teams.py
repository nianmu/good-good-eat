"""团队请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TeamCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=32, description="团队名称")


class TeamJoinIn(BaseModel):
    invite_code: str = Field(..., min_length=1, max_length=16, description="邀请码")


class TeamSetChefIn(BaseModel):
    user_id: int | None = Field(default=None, description="要指定为固定厨师的本团队成员 id；传 null/不传则取消固定厨师")