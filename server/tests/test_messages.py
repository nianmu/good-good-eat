"""消息中心测试（三期）：订单创建/流转/认领产生消息、列表、已读、越权。"""

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


def _setup(client: TestClient, owner_nick="团长", member_nick="成员"):
    owner = _guest(client, owner_nick)
    member = _guest(client, member_nick)
    team = client.post(f"{PREFIX}/teams", json={"name": "消息测试团"}, headers=_auth(owner["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(member["token"]))
    dish = client.get(f"{PREFIX}/dishes?page_size=1").json()["data"]["items"][0]
    order = client.post(
        f"{PREFIX}/orders",
        json={"team_id": team["id"], "items": [{"dish_id": dish["id"], "quantity": 2}]},
        headers=_auth(owner["token"]),
    ).json()["data"]
    return owner, member, team, order


def test_order_created_notifies_all_members_when_no_chef(client: TestClient, seeded) -> None:
    owner, member, team, order = _setup(client)
    msgs = client.get(f"{PREFIX}/messages", headers=_auth(member["token"])).json()["data"]
    assert msgs["unread_count"] >= 1
    assert any("新订单" in m["title"] for m in msgs["items"])


def test_fixed_chef_receives_notification(client: TestClient, seeded) -> None:
    owner = _guest(client, "团主A")
    chef = _guest(client, "固定厨A")
    team = client.post(f"{PREFIX}/teams", json={"name": "厨师消息团"}, headers=_auth(owner["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(chef["token"]))
    client.put(f"{PREFIX}/teams/{team['id']}/chef", json={"user_id": chef["id"]}, headers=_auth(owner["token"]))
    dish = client.get(f"{PREFIX}/dishes?page_size=1").json()["data"]["items"][0]
    client.post(
        f"{PREFIX}/orders",
        json={"team_id": team["id"], "items": [{"dish_id": dish["id"], "quantity": 1}]},
        headers=_auth(owner["token"]),
    )
    msgs = client.get(f"{PREFIX}/messages", headers=_auth(chef["token"])).json()["data"]
    assert any("新订单" in m["title"] for m in msgs["items"])


def test_status_flow_notifies_order_owner(client: TestClient, seeded) -> None:
    owner, member, team, order = _setup(client)
    client.post(f"{PREFIX}/orders/{order['id']}/accept", headers=_auth(member["token"]))
    msgs = client.get(f"{PREFIX}/messages", headers=_auth(owner["token"])).json()["data"]
    assert any("已被接单" in m["content"] for m in msgs["items"])


def test_claim_notifies_owner(client: TestClient, seeded) -> None:
    owner, member, team, order = _setup(client)
    client.post(f"{PREFIX}/orders/{order['id']}/claim", headers=_auth(member["token"]))
    msgs = client.get(f"{PREFIX}/messages", headers=_auth(owner["token"])).json()["data"]
    assert any("认领" in m["title"] for m in msgs["items"])


def test_mark_read_and_403(client: TestClient, seeded) -> None:
    owner, member, team, order = _setup(client)
    other = _guest(client, "路人X")
    msgs = client.get(f"{PREFIX}/messages", headers=_auth(member["token"])).json()["data"]
    mid = msgs["items"][0]["id"]

    r = client.post(f"{PREFIX}/messages/{mid}/read", headers=_auth(other["token"]))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    r = client.post(f"{PREFIX}/messages/{mid}/read", headers=_auth(member["token"]))
    assert r.status_code == 200
    assert r.json()["data"]["is_read"] is True

    msgs2 = client.get(f"{PREFIX}/messages", headers=_auth(member["token"])).json()["data"]
    assert msgs2["unread_count"] == msgs["unread_count"] - 1