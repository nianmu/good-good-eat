"""好大一颗菜 · 后端服务入口。

- /healthz 健康检查（含 DB 连通）
- M2.2–M2.4 模块路由挂载于 {settings.api_prefix}（见 api/v1/router.py）
- 统一响应信封与全局异常处理
"""

import logging
import sys

from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import get_db
from app.core.exceptions import ApiError

# Windows GBK 控制台/管道对 emoji 无法编码，SQLAlchemy echo 日志会刷屏报错；
# 统一改为容错编码，保证服务在任何重定向下正常输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="backslashreplace")

settings = get_settings()

logger = logging.getLogger("app")

app = FastAPI(title=settings.app_name, debug=settings.debug)

if settings.cors_origins.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.api_prefix)


@app.websocket("/ws/team/{team_id}")
async def ws_team_room(websocket: WebSocket, team_id: int) -> None:
    """团队多人房间（三期）：鉴权 → 成员校验 → 事件分发。"""
    from app.ws.handlers import team_room

    await team_room(websocket, team_id)


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    """业务错误 → 统一信封。"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "data": None},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """未预期异常 → 500 兜底统一信封（堆栈写日志便于排查）。"""
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"code": 50000, "message": "服务器内部错误", "data": None},
    )


@app.get("/healthz")
def healthz(db: Session = Depends(get_db)) -> dict:
    """健康检查：验证服务与数据库均可用。"""
    db.execute(text("SELECT 1"))
    return {"code": 0, "message": "ok", "data": {"status": "up", "database": "ok"}}