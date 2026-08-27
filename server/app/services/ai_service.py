"""AI 智能推荐服务（通用 OpenAI 兼容接口）。

职责：
- build_context(db, user)：拼接系统上下文（可见菜品清单 + 用户冰箱食材），供路由注入 system 消息
- build_system_prompt(context)：规定 AI 输出格式与约束（只推荐菜单里的菜、dish_id 必须存在）
- stream_chat(messages, context)：调用 `${base_url}/chat/completions` 流式对话，
  携带 recommend_dishes 工具（function calling），产出两类增量：
    {"type": "text", "delta": str}              —— 打字机文本
    {"type": "tool_args", "name": str, "arguments": str}  —— 工具调用参数（整段 JSON 字符串）

不落库：对话历史由前端页面内存维护，刷新即清空（见设计文档 §2）。
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.dish import Dish
from app.models.fridge import FridgeItem
from app.models.user import User

# OpenAI 兼容工具 schema：让模型结构化地返回可加购菜品（真实 dish_id）
RECOMMEND_DISHES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "recommend_dishes",
        "description": (
            "从【可选菜品清单】中挑选并向用户推荐一道或多道菜，"
            "同时给出简短推荐理由。dish_ids 必须是清单中出现过的真实菜品 id。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dish_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "被推荐菜品的 dish_id 列表（仅限清单中出现过的 id）",
                },
                "reason": {
                    "type": "string",
                    "description": "这桌菜的搭配理由（一句话，结合用户需求与冰箱食材）",
                },
            },
            "required": ["dish_ids"],
        },
    },
}

_HTTPX_TIMEOUT = httpx.Timeout(connect=10, read=180, write=30, pool=10)


def build_context(db: Session, user: User) -> str:
    """拼接上下文：可见菜品（轻量列，不含价格）+ 用户冰箱食材（全量注入）。"""
    # 可见菜品：只取轻量列（id/name/emoji），不拉价格与 ingredients/description 大字段
    rows = db.execute(
        select(Dish.id, Dish.name, Dish.emoji)
        .where(*_visible_conds(db, user))
        .order_by(Dish.id)
    ).all()

    lines = ["【可选菜品清单】"]
    for d in rows:
        name, emoji = d[1], d[2] or "🍽"
        lines.append(f"- id={d[0]}：{emoji}{name}")
    if not rows:
        lines.append("（当前无可见菜品）")

    lines.append("")
    lines.append("【用户冰箱现有食材】")
    fridge = db.execute(
        select(FridgeItem.name, FridgeItem.quantity).where(FridgeItem.user_id == user.id)
    ).all()
    for name, quantity in fridge:
        lines.append(f"- {name}" + (f" × {quantity}" if quantity else ""))
    if not fridge:
        lines.append("（冰箱空空如也）")

    return "\n".join(lines)


def _visible_conds(db: Session, user: User) -> list:
    """复用菜品模块可见性过滤（游客只见 public；登录见 public + 自己的 private + 所在团队的 team 菜）。"""
    from app.api.v1.dishes import visible_dish_conds

    return visible_dish_conds(db, user)


def build_system_prompt(context: str) -> str:
    """系统提示：规定输出方式、只推荐菜单里的菜、dish_id 必须真实、不提及价格。"""
    return (
        "你是「好好吃饭」的 AI 点菜助手，负责帮用户搭配一桌菜。\n"
        "规则：\n"
        "1. 只能推荐【可选菜品清单】中出现的菜；dish_id 必须是清单里的真实 id，禁止编造。\n"
        "2. 推荐一桌菜时先输出简短搭配说明（自然语言文本），再调用 recommend_dishes 工具给出 dish_ids。\n"
        "3. 结合用户描述的人数、口味与冰箱食材给出合理搭配；冰箱食材不足时在文本里说明。\n"
        "4. 全部用中文回答。\n"
        "5. 不要提及任何价格、金额或费用信息（平台不展示价格）。\n"
        "\n"
        "当前上下文：\n"
        f"{context}"
    )


async def stream_chat(messages: Sequence[dict[str, str]], context: str) -> AsyncIterator[dict[str, Any]]:
    """调用 OpenAI 兼容接口流式对话。

    messages: 用户历史（不含 system；context 由本函数注入 system 消息）
    产出：text（文本增量）与 tool_args（工具调用参数整段）两类事件字典。
    """
    settings: Settings = get_settings()
    payload = {
        "model": settings.ai_model,
        "messages": [{"role": "system", "content": build_system_prompt(context)}, *messages],
        "stream": True,
        "tools": [RECOMMEND_DISHES_TOOL],
        "tool_choice": "auto",
    }

    tool_args_by_index: dict[int, str] = {}
    async with httpx.AsyncClient(timeout=_HTTPX_TIMEOUT, base_url=settings.ai_base_url) as client:
        async with client.stream(
            "POST",
            "/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {settings.ai_api_key}"},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:") :].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                except (json.JSONDecodeError, TypeError):
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if content:
                    yield {"type": "text", "delta": content}
                for tc in delta.get("tool_calls") or []:
                    idx = tc.get("index", 0)
                    args = ((tc.get("function") or {}).get("arguments")) or ""
                    if args:
                        tool_args_by_index[idx] = tool_args_by_index.get(idx, "") + args

    # 流结束后一次性下发每个工具调用的完整参数（路由侧解析 dish_ids）
    for idx, arguments in tool_args_by_index.items():
        yield {"type": "tool_args", "name": "recommend_dishes", "arguments": arguments}


def parse_dish_ids(arguments: str) -> list[int]:
    """从工具调用参数 JSON 中提取 dish_ids；非法/缺失返回空列表（幻觉 id 由路由进一步过滤）。"""
    if not arguments:
        return []
    try:
        data = json.loads(arguments)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    ids = data.get("dish_ids")
    if not isinstance(ids, list):
        return []
    out: list[int] = []
    for item in ids:
        if isinstance(item, bool) or not isinstance(item, int):
            continue
        out.append(item)
    return out