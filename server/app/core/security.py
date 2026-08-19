"""JWT 签发 / 校验 / 当前用户依赖（M2.2 认证）。

- create_access_token(user_id)：签发 HS256 JWT，有效期 settings.jwt_expire_days 天
- decode_token(token)：校验并返回 user_id
- get_current_user：从 Authorization: Bearer 解析，失败抛 40101
"""

from __future__ import annotations

import datetime as dt

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.exceptions import ApiError
from app.models.user import User


def create_access_token(user_id: int) -> str:
    """签发 JWT，payload 含 sub=user_id。"""
    settings = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + dt.timedelta(days=settings.jwt_expire_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int:
    """校验 JWT，返回 user_id；失败统一抛 40101。"""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise ApiError(401, 40101, "登录已过期，请重新登录") from exc


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI 依赖：解析 Bearer Token 并返回当前用户。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, 40101, "未登录或登录已过期")
    token = authorization[len("Bearer ") :].strip()
    if not token:
        raise ApiError(401, 40101, "未登录或登录已过期")
    user_id = decode_token(token)
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(401, 40101, "用户不存在或登录已过期")
    return user