"""AI 智能推荐模块：对话式每餐推荐 + 一键加购（SSE 流式）。

契约（与前端 ai-stream.ts 对齐）：
- POST /ai/chat  body: { messages: [{role, content}] }（需登录）
- 响应为 SSE（HTTP 200）：data: {"type":"text","delta":...}
                              data: {"type":"dishes","items":[{dish_id,name,emoji,price,quantity}]}
                              data: {"type":"done"}
                              data: {"type":"error","message":...}
- 未配置 AI_API_KEY / AI_MODEL → 直接返回 error 事件（便于前端统一处理）
- 幻觉 dish_id：工具返回的 id 仅下发「当前用户可见」的真实菜品，其余过滤

对话历史不落库：前端页面内存维护，刷新即清空。
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.dishes import visible_dish
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services import ai_service

router = APIRouter()

_MAX_MESSAGES = 30
_MAX_CONTENT_LEN = 2000


class ChatMessageIn(BaseModel):
    """单条对话消息：仅允许 system/user/assistant 三种角色，限定长度。"""

    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1, max_length=_MAX_CONTENT_LEN)


class ChatRequestIn(BaseModel):
    """AI 对话请求：用户历史消息（上下文与系统提示由后端注入）。"""

    messages: list[ChatMessageIn] = Field(min_length=1, max_length=_MAX_MESSAGES)


def _sse(data: dict) -> str:
    """格式化一条 SSE 事件。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _event_stream(db: Session, user: User, body: ChatRequestIn) -> AsyncIterator[str]:
    """核心流：上下文注入 → 上游流式转发 → dishes 结构化事件 → done/error。"""
    settings = get_settings()
    context = ai_service.build_context(db, user)
    messages = [m.model_dump() for m in body.messages]
    try:
        async for evt in ai_service.stream_chat(messages, context):
            if evt["type"] == "text":
                yield _sse({"type": "text", "delta": evt["delta"]})
            elif evt["type"] == "tool_args":
                dish_ids = ai_service.parse_dish_ids(evt["arguments"])
                if not dish_ids:
                    continue
                # 只下发真实可见的菜品：幻觉 id / 已下架 / 对当前用户不可见一律过滤
                items: list[dict] = []
                seen: set[int] = set()
                for did in dish_ids:
                    if did in seen:
                        continue
                    seen.add(did)
                    dish = visible_dish(db, did, user)
                    if dish is None:
                        continue
                    items.append(
                        {
                            "dish_id": dish.id,
                            "name": dish.name,
                            "emoji": dish.emoji,
                            "price": float(dish.price),
                            "quantity": 1,
                        }
                    )
                if items:
                    yield _sse({"type": "dishes", "items": items})
        yield _sse({"type": "done"})
    except Exception as exc:  # 上游 4xx/5xx / 超时 / 网络异常 → error 事件（HTTP 200 + SSE）
        yield _sse({"type": "error", "message": f"AI 服务暂不可用：{exc}"})


@router.post("/ai/chat")
def ai_chat(
    body: ChatRequestIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """AI 对话（SSE）。需登录；未配置 AI 密钥时返回 error 事件而非 500。"""
    settings = get_settings()
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

    if not settings.ai_api_key or not settings.ai_model:

        async def _no_key() -> AsyncIterator[str]:
            yield _sse({"type": "error", "message": "AI 功能未配置"})

        return StreamingResponse(_no_key(), media_type="text/event-stream", headers=headers)

    return StreamingResponse(
        _event_stream(db, user, body), media_type="text/event-stream", headers=headers
    )