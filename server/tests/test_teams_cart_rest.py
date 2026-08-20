"""团队协作购物车 REST 接口测试（三期补充）：权限 + 快照 + 读 WS 内存态。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_teams import _auth, _guest

PREFIX = "/api/v1"


def test_team_cart_snapshot_requires_member(client: TestClient) -> None:
    owner = _guest(client, "团主")
    outsider = _guest(client, "路人")
    team = client.post(f"{PREFIX}/teams", json={"name": "私密团"}, headers=_auth(owner["token"])).json()["data"]
    r = client.get(f"{PREFIX}/teams/{team['id']}/cart", headers=_auth(outsider["token"]))
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_team_cart_snapshot_empty_when_none(client: TestClient, seeded) -> None:
    owner = _guest(client, "团主")
    team = client.post(f"{PREFIX}/teams", json={"name": "空团"}, headers=_auth(owner["token"])).json()["data"]
    r = client.get(f"{PREFIX}/teams/{team['id']}/cart", headers=_auth(owner["token"]))
    assert r.status_code == 200
    snap = r.json()["data"]
    assert snap["team_id"] == team["id"]
    assert snap["items"] == []


def test_team_cart_snapshot_reflects_ws_upsert(client: TestClient, seeded) -> None:
    """成员 A 通过 WS 加菜后，成员 B 拉 REST 快照应看到该菜。"""
    a = _guest(client, "甲")
    b = _guest(client, "乙")
    team = client.post(f"{PREFIX}/teams", json={"name": "WS-Cart团"}, headers=_auth(a["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(b["token"]))

    dish = client.get(f"{PREFIX}/dishes?page_size=1").json()["data"]["items"][0]

    url = f"/ws/team/{team['id']}?token={a['token']}"
    with client.websocket_connect(url) as ws:
        ws.send_json({"event": "join", "data": {}})
        assert ws.receive_json()["event"] == "joined"
        assert ws.receive_json()["event"] == "cart.snapshot"
        ws.send_json(
            {"event": "cart.upsert", "data": {"dish_id": dish["id"], "quantity": 1, "action": "plus"}}
        )
        ws.receive_json()  # upsert 回显

    # 成员 B 拉 REST 快照 → 应包含 A 刚点的菜
    r = client.get(f"{PREFIX}/teams/{team['id']}/cart", headers=_auth(b["token"]))
    assert r.status_code == 200
    ids = [it["dish_id"] for it in r.json()["data"]["items"]]
    assert dish["id"] in ids
