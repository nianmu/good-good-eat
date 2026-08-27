"""AI 智能推荐接口测试：上下文构建 / SSE 事件 / 幻觉 id 过滤 / 未配置降级 / 鉴权。"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.services import ai_service
from app.models.fridge import FridgeItem
from app.services.auth_service import create_user

PREFIX = "/api/v1"


def _guest(client: TestClient, nickname: str) -> dict:
    r = client.post(f"{PREFIX}/auth/guest", json={"nickname": nickname})
    assert r.status_code == 200
    data = r.json()["data"]
    return {"token": data["token"], "id": data["user"]["id"], "nickname": nickname}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _parse_sse(text: str) -> list[dict]:
    """解析 SSE 文本为事件列表。"""
    events = []
    for line in text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: ") :]))
    return events


# ─────────────── 假 httpx 流式客户端（模拟 OpenAI 兼容上游）───────────────


class FakeLineStream:
    def __init__(self, lines: list[str], fail_status: int | None = None) -> None:
        self._lines = lines
        self._fail_status = fail_status

    async def __aenter__(self) -> "FakeLineStream":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    def raise_for_status(self) -> None:
        if self._fail_status:
            raise httpx.HTTPStatusError(
                f"upstream {self._fail_status}",
                request=httpx.Request("POST", "http://upstream/chat/completions"),
                response=httpx.Response(self._fail_status, request=httpx.Request("POST", "http://upstream")),
            )

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class FakeAsyncClient:
    """记录请求体；可选择抛错模拟上游异常。"""

    def __init__(self, lines: list[str] | None = None, error: Exception | None = None) -> None:
        self._lines = lines or []
        self._error = error
        self.request_payload: dict | None = None
        self.headers: dict | None = None

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    def stream(self, method: str, url: str, **kwargs) -> FakeLineStream:
        if self._error is not None:
            raise self._error
        self.request_payload = kwargs.get("json")
        self.headers = kwargs.get("headers")
        return FakeLineStream(self._lines)


def _chunk(content: str | None = None, tool_calls: list[dict] | None = None) -> str:
    delta: dict = {}
    if content is not None:
        delta["content"] = content
    if tool_calls:
        delta["tool_calls"] = tool_calls
    return "data: " + json.dumps({"choices": [{"delta": delta}]}) + "\n\n"


def _tool_call(index: int, args_fragment: str) -> list[dict]:
    return [
        {
            "index": index,
            "id": f"call_{index}",
            "type": "function",
            "function": {"name": "recommend_dishes", "arguments": args_fragment},
        }
    ]


def _enable_ai(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_api_key", "test-key")
    monkeypatch.setattr(settings, "ai_model", "test-model")


def _patch_upstream(monkeypatch, lines: list[str] | None = None, error: Exception | None = None) -> FakeAsyncClient:
    fake = FakeAsyncClient(lines or [], error=error)
    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **kwargs: fake)
    return fake


# ─────────────── 用例 ───────────────


def test_ai_chat_requires_login(client: TestClient) -> None:
    r = client.post(
        f"{PREFIX}/ai/chat", json={"messages": [{"role": "user", "content": "推荐一桌菜"}]}
    )
    assert r.status_code == 401
    assert r.json()["code"] == 40101


def test_ai_chat_no_key_returns_error_event(client: TestClient, monkeypatch) -> None:
    """未配置 AI_API_KEY → HTTP 200 + SSE error 事件（前端统一处理）。"""
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_api_key", "")
    g = _guest(client, "AI游客")
    r = client.post(
        f"{PREFIX}/ai/chat",
        json={"messages": [{"role": "user", "content": "推荐一桌菜"}]},
        headers=_auth(g["token"]),
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    assert events[-1]["type"] == "error"
    assert "AI 功能未配置" in events[-1]["message"]


def test_build_context_contains_visible_dishes_and_fridge(seeded) -> None:
    """上下文包含可见菜品与冰箱食材；不拉取大字段。"""
    db = SessionLocal()
    try:
        user = create_user(db, nickname="上下文测试")
        db.add(FridgeItem(user_id=user.id, name="鸡蛋", quantity="6个"))
        db.add(FridgeItem(user_id=user.id, name="番茄", quantity="3个"))
        db.commit()

        from sqlalchemy import select
        from app.models.dish import Dish

        dish_name = db.scalar(select(Dish.name).order_by(Dish.id).limit(1))
        assert dish_name is not None

        context = ai_service.build_context(db, user)
        assert "【可选菜品清单】" in context
        assert dish_name in context
        assert "id=" in context
        assert "【用户冰箱现有食材】" in context
        assert "鸡蛋" in context
        assert "番茄" in context
    finally:
        db.close()


def test_ai_chat_streams_text_and_filters_hallucinated_dishes(client: TestClient, seeded, monkeypatch) -> None:
    """文本增量逐步下发；dish_ids 中幻觉/不可见 id 被过滤，只下发真实可见菜品。"""
    _enable_ai(monkeypatch)
    real = client.get(f"{PREFIX}/dishes?page_size=1").json()["data"]["items"][0]
    real_id = real["id"]
    # 工具参数分两段下发（累积）；夹带幻觉 id 99999999
    args_a = f'{{"dish_ids": [{real_id}'
    args_b = ', 99999999], "reason": "荤素搭配均衡"}'
    lines = [
        _chunk(content="今天推荐："),
        _chunk(content="红烧肉。"),
        _chunk(tool_calls=_tool_call(0, args_a)),
        _chunk(tool_calls=_tool_call(0, args_b)),
        "data: [DONE]\n\n",
    ]
    fake = _patch_upstream(monkeypatch, lines)

    g = _guest(client, "AI甲")
    r = client.post(
        f"{PREFIX}/ai/chat",
        json={"messages": [{"role": "user", "content": "两个人吃，来个荤菜"}]},
        headers=_auth(g["token"]),
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    kinds = [e["type"] for e in events]

    # 文本增量按段下发
    text_deltas = [e["delta"] for e in events if e["type"] == "text"]
    assert text_deltas == ["今天推荐：", "红烧肉。"]

    # dishes 事件只含真实 id
    dishes_events = [e for e in events if e["type"] == "dishes"]
    assert len(dishes_events) == 1
    items = dishes_events[0]["items"]
    assert [it["dish_id"] for it in items] == [real_id]
    assert items[0]["name"] == real["name"]
    assert items[0]["quantity"] == 1

    assert kinds[-1] == "done"
    # 上游请求体：system 上下文 + 用户历史 + 工具 schema
    payload = fake.request_payload
    assert payload["model"] == "test-model"
    assert payload["stream"] is True
    assert payload["tool_choice"] == "auto"
    assert payload["tools"][0]["function"]["name"] == "recommend_dishes"
    assert payload["messages"][0]["role"] == "system"
    assert "【可选菜品清单】" in payload["messages"][0]["content"]
    assert payload["messages"][-1] == {"role": "user", "content": "两个人吃，来个荤菜"}
    assert fake.headers["Authorization"] == "Bearer test-key"


def test_ai_chat_text_only_has_no_dishes_event(client: TestClient, seeded, monkeypatch) -> None:
    """模型未触发工具调用（只回文本）→ 无 dishes 事件，仍正常 done。"""
    _enable_ai(monkeypatch)
    _patch_upstream(monkeypatch, [_chunk(content="今天不想推荐菜。"), "data: [DONE]\n\n"])

    g = _guest(client, "AI乙")
    r = client.post(
        f"{PREFIX}/ai/chat",
        json={"messages": [{"role": "user", "content": "你觉得呢"}]},
        headers=_auth(g["token"]),
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    assert all(e["type"] != "dishes" for e in events)
    assert events[-1]["type"] == "done"


def test_ai_chat_upstream_failure_yields_error_event(client: TestClient, seeded, monkeypatch) -> None:
    """上游异常 → error 事件（HTTP 200 + SSE）。"""
    _enable_ai(monkeypatch)
    _patch_upstream(monkeypatch, error=httpx.ReadTimeout("upstream timed out"))

    g = _guest(client, "AI丙")
    r = client.post(
        f"{PREFIX}/ai/chat",
        json={"messages": [{"role": "user", "content": "推荐"}]},
        headers=_auth(g["token"]),
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    assert events[-1]["type"] == "error"
    assert "AI 服务暂不可用" in events[-1]["message"]


def test_parse_dish_ids_rejects_garbage() -> None:
    assert ai_service.parse_dish_ids('{"dish_ids": [1, 2]}') == [1, 2]
    assert ai_service.parse_dish_ids('{"dish_ids": ["1", 2, true]}') == [2]
    assert ai_service.parse_dish_ids("not json") == []
    assert ai_service.parse_dish_ids("") == []
    assert ai_service.parse_dish_ids('{"foo": 1}') == []