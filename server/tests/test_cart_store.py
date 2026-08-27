"""团队购物车存储单元测试：内存实现 + Redis 实现（假客户端，不依赖真实 Redis）。

Redis 路径用假客户端覆盖：JSON 序列化（int key 还原）、损坏数据回落、删除语义；
create_default_store 的 Redis 优先 / 内存兜底切换。真实 Redis 连通性由集成测试
（tests/test_ws.py / test_teams_cart_rest.py，测试期固定内存 store）保证确定性。
"""

from __future__ import annotations

import json
import types

from app.ws.cart_store import MemoryCartStore, RedisCartStore, create_default_store


class FakeRedisClient:
    """最小 redis.Redis 兼容假客户端（decode_responses=True 语义）。"""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def ping(self) -> bool:
        return True

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value

    def delete(self, key: str) -> int:
        return 1 if self.data.pop(key, None) is not None else 0


_SAMPLE_CART = {
    1: {"quantity": 2, "users": {7: "张三", 8: "李四"}},
    2: {"quantity": 1, "users": {7: "张三"}},
}


def test_memory_store_roundtrip_and_delete() -> None:
    store = MemoryCartStore()
    assert store.get(1) == {}
    store.set(1, _SAMPLE_CART)
    assert store.get(1)[1]["quantity"] == 2
    assert store.get(1)[2]["users"] == {7: "张三"}
    # 独立副本：get 返回的 dict 与原值解耦，改返回值不影响存储
    got = store.get(1)
    got[1]["quantity"] = 999
    assert store.get(1)[1]["quantity"] == 2
    store.delete(1)
    assert store.get(1) == {}


def test_redis_store_roundtrip_with_int_keys() -> None:
    client = FakeRedisClient()
    store = RedisCartStore(client)
    store.set(3, _SAMPLE_CART)

    raw = client.get("ggc:cart:3")
    parsed = json.loads(raw)
    assert parsed["1"]["users"] == {"7": "张三", "8": "李四"}  # 落盘为 JSON（string key）

    got = store.get(3)
    assert isinstance(got, dict)
    assert 1 in got and 2 in got  # int key 还原
    assert got[1]["users"] == {7: "张三", 8: "李四"}  # user_id 还原为 int
    assert got[2]["quantity"] == 1


def test_redis_store_corrupt_json_returns_empty() -> None:
    client = FakeRedisClient()
    client.data["ggc:cart:9"] = "{not valid json"
    store = RedisCartStore(client)
    assert store.get(9) == {}

    client.data["ggc:cart:9"] = "[1,2,3]"  # 非 dict → 视为空
    assert store.get(9) == {}


def test_redis_store_missing_key_returns_empty_and_delete() -> None:
    store = RedisCartStore(FakeRedisClient())
    assert store.get(404) == {}
    store.delete(404)  # 不抛错


def test_manager_multi_user_upserts_survive_redis_roundtrips() -> None:
    """多用户在同一道菜上操作，跨 Redis 序列化往返后语义不丢（user_id 键类型回归）。"""
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager(store=RedisCartStore(FakeRedisClient()))
    mgr.apply_cart_upsert(1, 10, 1, "plus", 7, "甲")
    mgr.apply_cart_upsert(1, 10, 1, "plus", 8, "乙")  # 第二次写触发一次完整的 JSON 往返
    snap = mgr.cart_snapshot(1)
    assert snap["items"][0]["user_ids"] == [7, 8]
    assert snap["items"][0]["quantity"] == 2

    # minus 语义：总数量 -1，成员标记保留（产品语义）
    mgr.apply_cart_upsert(1, 10, 1, "minus", 7, "甲")
    snap2 = mgr.cart_snapshot(1)
    assert snap2["items"][0]["quantity"] == 1
    assert snap2["items"][0]["user_ids"] == [7, 8]

    # set 语义：某用户把这道菜设为 0 → 移除该成员贡献（跨往返后 int key 正常命中）
    mgr.apply_cart_upsert(1, 10, 0, "set", 7, "甲")
    snap3 = mgr.cart_snapshot(1)
    assert snap3["items"][0]["user_ids"] == [8]

    # 全部成员移除 → 条目清空
    mgr.apply_cart_upsert(1, 10, 0, "set", 8, "乙")
    assert mgr.cart_snapshot(1)["items"] == []

    mgr.clear_cart(1)
    assert mgr.cart_snapshot(1)["items"] == []


def _patch_redis_module(monkeypatch, fake_module) -> None:
    """把 cart_store.create_default_store 内部的 `import redis` 指向假模块

    `import redis` 在函数体内解析时优先走 sys.modules，因此须替换 sys.modules 条目
    （仅改模块属性会被真实 sys.modules 条目盖过）。
    """
    import sys

    monkeypatch.setitem(sys.modules, "redis", fake_module)


def test_create_default_store_uses_redis_when_available(monkeypatch) -> None:
    fake_client = FakeRedisClient()

    class FakeRedis:
        @classmethod
        def from_url(cls, url: str, **kwargs) -> FakeRedisClient:
            assert "redis://127.0.0.1:6379" in url
            return fake_client

    _patch_redis_module(monkeypatch, types.SimpleNamespace(Redis=FakeRedis))
    store = create_default_store()
    assert isinstance(store, RedisCartStore)
    store.set(1, _SAMPLE_CART)
    assert store.get(1)[1]["users"][7] == "张三"


def test_create_default_store_falls_back_to_memory_when_redis_down(monkeypatch) -> None:
    class BrokenRedis:
        @classmethod
        def from_url(cls, url: str, **kwargs) -> None:
            raise ConnectionError("redis down")

    _patch_redis_module(monkeypatch, types.SimpleNamespace(Redis=BrokenRedis))
    store = create_default_store()
    assert isinstance(store, MemoryCartStore)