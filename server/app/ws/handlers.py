"""WebSocket 事件分发（团队房间）。

协议（与小程序端契约一致）：
  客户端 → 服务端：join / cart.upsert / cart.clear / pong
  服务端 → 客户端：joined / member.joined / cart.snapshot / cart.upsert / cart.clear / ping
                    / activity.created / activity.status_changed / activity.item_added
                    / activity.item_removed / activity.item_chef_changed / activity.item_status_changed
  活动事件通过 app.api.v1.activities 中各变更点调用 manager.broadcast_sync(team_id, event, data) 推送，
  载荷为 {activity} 或 {item, activity_id} / {item_id, activity_id}，异常不影响主流程。
"""

from __future__ import annotations

import json

from fastapi import WebSocket
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.exceptions import ApiError
from app.core.security import decode_token
from app.models.dish import Dish
from app.models.user import TeamMember, User
from app.ws.manager import ConnectionManager

manager = ConnectionManager()

_HEARTBEAT_SECONDS = 60

# WS 鉴权子协议：客户端通过 protocols: ["ggc-token", <jwt>] 携带 token，
# 服务端 accept 时回显该子协议（浏览器要求响应必须命中请求列表之一）。
# 兼容旧客户端：仍支持 ?token= 查询参数（逐步废弃）。
WS_AUTH_PROTOCOL = "ggc-token"


def _extract_token(websocket: WebSocket) -> tuple[str, bool]:
    """从 Sec-WebSocket-Protocol 头或查询参数提取 token；返回 (token, 是否走子协议)。"""
    proto_header = websocket.headers.get("sec-websocket-protocol", "")
    parts = [p.strip() for p in proto_header.split(",") if p.strip()]
    if len(parts) >= 2 and parts[0] == WS_AUTH_PROTOCOL:
        return parts[1], True
    return websocket.query_params.get("token", ""), False


def _auth_user(token: str) -> User:
    """token → 用户；失败抛 40101。"""
    user_id = decode_token(token)
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
    finally:
        db.close()
    if user is None:
        raise ApiError(401, 40101, "登录已过期，请重新登录")
    return user


def _is_team_member(team_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        return (
            db.scalar(
                select(TeamMember.id).where(
                    TeamMember.team_id == team_id, TeamMember.user_id == user_id
                )
            )
            is not None
        )
    finally:
        db.close()


def _dish_active(dish_id: int) -> bool:
    db = SessionLocal()
    try:
        dish = db.get(Dish, dish_id)
        return dish is not None and dish.is_active
    finally:
        db.close()


async def handle_text(websocket: WebSocket, team_id: int, user: User, raw: str) -> None:
    """处理一条客户端消息；非法 JSON 直接忽略。"""
    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(msg, dict):
        return

    event = msg.get("event")
    data = msg.get("data") or {}

    if event == "join":
        # 确认加入 + 下发购物车快照；广播新成员给其他人
        await manager.send(websocket, team_id, "joined", {"user_id": user.id, "nickname": user.nickname})
        await manager.send(websocket, team_id, "cart.snapshot", manager.cart_snapshot(team_id))
        await manager.broadcast(
            team_id,
            "member.joined",
            {"user_id": user.id, "nickname": user.nickname},
            exclude=websocket,
        )

    elif event == "cart.upsert":
        dish_id = data.get("dish_id")
        quantity = data.get("quantity", 1)
        action = data.get("action", "plus")
        if not isinstance(dish_id, int) or not _dish_active(dish_id):
            return
        payload = manager.apply_cart_upsert(team_id, dish_id, quantity, action, user.id, user.nickname)
        await manager.broadcast(team_id, "cart.upsert", payload)

    elif event == "cart.clear":
        manager.clear_cart(team_id)
        await manager.broadcast(team_id, "cart.clear", {"user_id": user.id, "nickname": user.nickname})

    elif event == "pong":
        pass  # 心跳应答，无需处理


async def team_room(websocket: WebSocket, team_id: int) -> None:
    """/ws/team/{team_id} 入口：鉴权（子协议优先，兼容 query token）→ 校验成员 → 加入房间 → 循环分发。"""
    token, via_protocol = _extract_token(websocket)
    user: User | None = None
    try:
        user = _auth_user(token)
        is_member = _is_team_member(team_id, user.id)
    except ApiError:
        is_member = False

    # 先 accept（starlette 要求 accept 后才能 close/send），再按鉴权结果关闭；
    # 走子协议鉴权时必须回显子协议，否则浏览器会主动断开
    await manager.connect(team_id, websocket, subprotocol=WS_AUTH_PROTOCOL if via_protocol else None)
    if user is None or not is_member:
        await websocket.close(code=4401 if user is None else 4403)
        manager.disconnect(team_id, websocket)
        return

    try:
        while True:
            raw = await websocket.receive_text()
            await handle_text(websocket, team_id, user, raw)
    except Exception:
        pass  # 客户端断开/异常
    finally:
        manager.disconnect(team_id, websocket)