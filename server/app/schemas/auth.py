"""认证相关请求模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GuestLoginIn(BaseModel):
    """游客登录：昵称可选。"""

    nickname: str | None = Field(default=None, max_length=64)


class WxLoginIn(BaseModel):
    """微信登录：code 换 openid。"""

    code: str = Field(min_length=1, max_length=128)


class WebRegisterIn(BaseModel):
    """H5/Web 独立账号注册：用户名 + 密码（凭此绕开微信）。"""

    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=6, max_length=64)
    nickname: str | None = Field(default=None, max_length=64)


class WebLoginIn(BaseModel):
    """H5/Web 独立账号登录：用户名 + 密码。"""

    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=64)


class ProfileUpdateIn(BaseModel):
    """个人信息修改（当前仅支持昵称）。"""

    nickname: str = Field(min_length=1, max_length=64)