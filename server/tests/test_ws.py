"""WebSocket 团队房间测试（三期）：join 确认、成员广播、购物车同步、非成员拒绝。"""

from __future__ import annotations

from fastapi.testclient import TestClient

PREFIX = "/api/v1"


def _guest(client: TestClient, nickname: str) -> dict:
    r = client.post(f"{PREFIX}/auth/guest", json={"nickname": nickname})
    assert r.status_code == 200
    data = r.json()["data"]
    return {"token": data["token"], "id": data["user"]["id"], "nickname": nickname}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup(client: TestClient):
    a = _guest(client, "甲")
    b = _guest(client, "乙")
    team = client.post(f"{PREFIX}/teams", json={"name": "WS测试团"}, headers=_auth(a["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(b["token"]))
    dish = client.get(f"{PREFIX}/dishes?page_size=1").json()["data"]["items"][0]
    return a, b, team, dish


def test_ws_join_and_cart_broadcast(client: TestClient, seeded) -> None:
    a, b, team, dish = _setup(client)
    url_a = f"/ws/team/{team['id']}?token={a['token']}"
    url_b = f"/ws/team/{team['id']}?token={b['token']}"

    with client.websocket_connect(url_a) as ws_a:
        ws_a.send_json({"event": "join", "data": {}})
        assert ws_a.receive_json()["event"] == "joined"
        assert ws_a.receive_json()["event"] == "cart.snapshot"

        with client.websocket_connect(url_b) as ws_b:
            ws_b.send_json({"event": "join", "data": {}})
            assert ws_b.receive_json()["event"] == "joined"
            assert ws_b.receive_json()["event"] == "cart.snapshot"
            # A 应收到 B 加入广播
            evt = ws_a.receive_json()
            assert evt["event"] == "member.joined"
            assert evt["data"]["user_id"] == b["id"]

            # A 加菜 → B 收到 cart.upsert
            ws_a.send_json(
                {"event": "cart.upsert", "data": {"dish_id": dish["id"], "quantity": 1, "action": "plus"}}
            )
            evt = ws_b.receive_json()
            assert evt["event"] == "cart.upsert"
            assert evt["data"]["dish_id"] == dish["id"]
            assert evt["data"]["user_id"] == a["id"]


def test_ws_snapshot_reflects_existing_cart(client: TestClient, seeded) -> None:
    a, b, team, dish = _setup(client)
    # A 先加菜再断开，B 加入时快照应包含该菜
    with client.websocket_connect(f"/ws/team/{team['id']}?token={a['token']}") as ws_a:
        ws_a.send_json({"event": "join", "data": {}})
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # snapshot
        ws_a.send_json(
            {"event": "cart.upsert", "data": {"dish_id": dish["id"], "quantity": 1, "action": "plus"}}
        )
        ws_a.receive_json()  # cart.upsert 回显

    with client.websocket_connect(f"/ws/team/{team['id']}?token={b['token']}") as ws_b:
        ws_b.send_json({"event": "join", "data": {}})
        ws_b.receive_json()  # joined
        snap = ws_b.receive_json()
        assert snap["event"] == "cart.snapshot"
        ids = [it["dish_id"] for it in snap["data"]["items"]]
        assert dish["id"] in ids


def test_ws_non_member_rejected(client: TestClient, seeded) -> None:
    a, b, team, dish = _setup(client)
    outsider = _guest(client, "路人WS")
    url = f"/ws/team/{team['id']}?token={outsider['token']}"
    with client.websocket_connect(url) as ws:
        closed = False
        try:
            ws.receive_json()
        except Exception:
            closed = True
        assert closed, "非成员连接应被服务端关闭"