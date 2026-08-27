"""团队购物车存储抽象：内存 / Redis 双实现，供 WS ConnectionManager 使用。

- MemoryCartStore：进程内 dict（兜底；服务重启即清空）
- RedisCartStore：Redis 单键 JSON（多 worker 共享、重启保留）

存储形态：team_id → {dish_id: {"quantity": int, "users": {user_id: nickname}}}
"""

from __future__ import annotations

import copy
import json
from typing import Any


class CartStore:
    """购物车存储接口。"""

    def get(self, team_id: int) -> dict[int, dict[str, Any]]:
        raise NotImplementedError

    def set(self, team_id: int, cart: dict[int, dict[str, Any]]) -> None:
        raise NotImplementedError

    def delete(self, team_id: int) -> None:
        raise NotImplementedError


class MemoryCartStore(CartStore):
    """进程内 dict 实现；get/set 均深拷贝，语义与 Redis 的 JSON 快照一致
    （调用方拿到的是独立副本，改返回值不影响存储）。"""

    def __init__(self) -> None:
        self._data: dict[int, dict[int, dict[str, Any]]] = {}

    def get(self, team_id: int) -> dict[int, dict[str, Any]]:
        return copy.deepcopy(self._data.get(team_id, {}))

    def set(self, team_id: int, cart: dict[int, dict[str, Any]]) -> None:
        self._data[team_id] = copy.deepcopy(cart)

    def delete(self, team_id: int) -> None:
        self._data.pop(team_id, None)


class RedisCartStore(CartStore):
    """Redis 单键 JSON 存储；key = ggc:cart:{team_id}，value 为整份购物车 JSON。"""

    PREFIX = "ggc:cart:"

    def __init__(self, client: Any) -> None:
        # redis.Redis（decode_responses=True）
        self._client = client

    def _key(self, team_id: int) -> str:
        return f"{self.PREFIX}{team_id}"

    def get(self, team_id: int) -> dict[int, dict[str, Any]]:
        raw = self._client.get(self._key(team_id))
        if not raw:
            return {}
        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                return {}
            out: dict[int, dict[str, Any]] = {}
            for k, v in data.items():
                try:
                    dish_id = int(k)
                except (ValueError, TypeError):
                    continue
                if not isinstance(v, dict):
                    continue
                entry = dict(v)
                # users 的 user_id 键经 JSON 落盘后是字符串，读回时还原为 int，
                # 否则与 apply_cart_upsert 的 int user_id 语义不一致（删改/排序会出错）
                users = v.get("users")
                if isinstance(users, dict):
                    normalized: dict[Any, str] = {}
                    for uid_raw, nick in users.items():
                        try:
                            normalized[int(uid_raw)] = nick
                        except (ValueError, TypeError):
                            normalized[uid_raw] = nick
                    entry["users"] = normalized
                out[dish_id] = entry
            return out
        except (ValueError, TypeError):
            return {}

    def set(self, team_id: int, cart: dict[int, dict[str, Any]]) -> None:
        data = {str(k): v for k, v in cart.items()}
        self._client.set(self._key(team_id), json.dumps(data, ensure_ascii=False))

    def delete(self, team_id: int) -> None:
        self._client.delete(self._key(team_id))


def create_default_store() -> CartStore:
    """按配置创建默认存储：Redis 可用则用 Redis，否则回退内存（测试/无 Redis 环境）。"""
    from app.core.config import get_settings

    url = get_settings().redis_url
    if url:
        try:
            import redis

            client = redis.Redis.from_url(url, socket_connect_timeout=2, decode_responses=True)
            client.ping()
            return RedisCartStore(client)
        except Exception:
            pass
    return MemoryCartStore()
