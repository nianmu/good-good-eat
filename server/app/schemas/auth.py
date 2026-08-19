"""认证相关请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GuestLoginIn(BaseModel):
    """游客登录：昵称可选。"""

    nickname: str | None = Field(default=None, max_length=64)


class WxLoginIn(BaseModel):
    """微信登录：code 换 openid。"""

    code: str = Field(min_length=1, max_length=128)