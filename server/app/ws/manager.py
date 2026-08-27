"""WebSocket 多人房间：连接管理 + 团队购物车（Redis/内存可切换存储）。"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

from app.ws.cart_store import CartStore, create_default_store


class ConnectionManager:
    """按团队分房的 WS 连接管理 + 该团队的协作购物车。

    购物车存储由 CartStore 提供（默认 Redis，Redis 不可用时回退内存），
    使多 worker 可共享、服务重启不丢失（Redis 时）。

    事件协议（与小程序端契约一致）：
      服务端 → 客户端：joined / member.joined / cart.snapshot / cart.upsert / cart.clear
                      / order.created / order.status_changed / ping
      客户端 → 服务端：join / cart.upsert / cart.clear / pong
    所有广播消息均带递增 seq（按房间）。
    """

    def __init__(self, store: CartStore | None = None) -> None:
        self.rooms: dict[int, set[WebSocket]] = {}
        self._store: CartStore = store if store is not None else create_default_store()
        self._seq: dict[int, int] = {}
        # 持有后台广播任务强引用，防止任务被 GC 半途丢弃
        self._bg_tasks: set[asyncio.Task] = set()

    # ===== 连接管理 =====
    async def connect(self, team_id: int, websocket: WebSocket, subprotocol: str | None = None) -> None:
        await websocket.accept(subprotocol=subprotocol)
        self.rooms.setdefault(team_id, set()).add(websocket)

    def disconnect(self, team_id: int, websocket: WebSocket) -> None:
        room = self.rooms.get(team_id)
        if room:
            room.discard(websocket)
            if not room:
                self.rooms.pop(team_id, None)

    def _next_seq(self, team_id: int) -> int:
        self._seq[team_id] = self._seq.get(team_id, 0) + 1
        return self._seq[team_id]

    def _payload(self, team_id: int, event: str, data: dict) -> str:
        return json.dumps({"event": event, "data": data, "seq": self._next_seq(team_id)}, ensure_ascii=False)

    async def send(self, websocket: WebSocket, team_id: int, event: str, data: dict) -> None:
        await websocket.send_text(self._payload(team_id, event, data))

    async def broadcast(self, team_id: int, event: str, data: dict, exclude: WebSocket | None = None) -> None:
        payload = self._payload(team_id, event, data)
        for ws in list(self.rooms.get(team_id, set())):
            if ws is exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(team_id, ws)

    def broadcast_sync(self, team_id: int, event: str, data: dict, exclude: WebSocket | None = None) -> None:
        """同步上下文中触发广播（订单状态等），兼容 sync 路由。

        - 当前线程有运行中的事件循环（async 路由内调用）→ 创建后台任务
        - 否则（FastAPI sync 路由跑在线程池、无 loop）→ 新建临时循环执行
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None and loop.is_running():
            task = loop.create_task(self.broadcast(team_id, event, data, exclude))
            self._bg_tasks.add(task)
            task.add_done_callback(self._bg_tasks.discard)
            return
        try:
            asyncio.run(self.broadcast(team_id, event, data, exclude))
        except RuntimeError:
            pass  # 极端嵌套场景下放弃本次广播，不影响主流程

    # ===== 团队购物车 =====
    def cart_snapshot(self, team_id: int) -> dict:
        """当前团队购物车快照（供 join 时下发与 REST 查询）。"""
        cart = self._store.get(team_id)
        items = [
            {
                "dish_id": dish_id,
                "quantity": v["quantity"],
                "user_ids": sorted(v["users"].keys()),
                "users": [{"user_id": uid, "nickname": nick} for uid, nick in v["users"].items()],
            }
            for dish_id, v in sorted(cart.items())
        ]
        return {"team_id": team_id, "items": items}

    def apply_cart_upsert(
        self, team_id: int, dish_id: int, quantity: int, action: str, user_id: int, nickname: str
    ) -> dict:
        """应用一次购物车变更，返回要广播的 data（含变更后合计数量）。"""
        cart = self._store.get(team_id)
        entry = cart.setdefault(dish_id, {"quantity": 0, "users": {}})

        if action == "set":
            # 该用户把这道菜设为 quantity（0 = 移除该用户）
            if quantity <= 0:
                entry["users"].pop(user_id, None)
            else:
                entry["users"][user_id] = nickname
        else:
            step = 1 if action in ("plus", "add") else -1
            entry["users"][user_id] = nickname
            entry["quantity"] = max(0, entry.get("quantity", 0) + step)
            quantity = entry["quantity"]

        # 归一化：无用户时清掉条目
        if not entry["users"]:
            cart.pop(dish_id, None)
            total = 0
        else:
            # 以各用户数量求和为准：plus/minus 时以 quantity 兜底
            total = max(entry.get("quantity", 0), 1) if action not in ("set",) else sum(
                1 for _ in entry["users"]
            )
            if action == "set" and quantity > 0:
                # set 语义：该用户单人数量；多人场景下累加
                entry["quantity"] = quantity

        self._store.set(team_id, cart)

        return {
            "dish_id": dish_id,
            "quantity": entry.get("quantity", 0),
            "total_quantity": entry.get("quantity", 0),
            "action": action,
            "user_id": user_id,
            "nickname": nickname,
            "user_ids": sorted(entry.get("users", {}).keys()),
        }

    def clear_cart(self, team_id: int) -> None:
        self._store.delete(team_id)