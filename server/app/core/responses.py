"""统一响应信封：{"code": 0, "message": "ok", "data": ...}。"""

from __future__ import annotations

from typing import Any


def ok(data: Any = None) -> dict:
    """成功响应信封。"""
    return {"code": 0, "message": "ok", "data": data}