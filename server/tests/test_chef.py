"""厨师看板测试（三期）：chef/orders 归属、聚合、食材汇总、非厨师空列表。"""

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


def _setup(client: TestClient, chef_nick="大厨", member_nick="点菜人"):
    chef = _guest(client, chef_nick)
    member = _guest(client, member_nick)
    team = client.post(f"{PREFIX}/teams", json={"name": "看板测试团"}, headers=_auth(chef["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(member["token"]))
    client.put(f"{PREFIX}/teams/{team['id']}/chef", json={"user_id": chef["id"]}, headers=_auth(chef["token"]))

    dishes = client.get(f"{PREFIX}/dishes?page_size=2").json()["data"]["items"]
    o1 = client.post(
        f"{PREFIX}/orders",
        json={"team_id": team["id"], "items": [{"dish_id": dishes[0]["id"], "quantity": 2}]},
        headers=_auth(member["token"]),
    ).json()["data"]
    o2 = client.post(
        f"{PREFIX}/orders",
        json={
            "team_id": team["id"],
            "items": [
                {"dish_id": dishes[0]["id"], "quantity": 1},
                {"dish_id": dishes[1]["id"], "quantity": 3},
            ],
        },
        headers=_auth(member["token"]),
    ).json()["data"]
    return chef, member, team, (o1, o2)


def test_chef_orders_returns_chef_orders(client: TestClient, seeded) -> None:
    chef, member, team, (o1, o2) = _setup(client)
    res = client.get(f"{PREFIX}/chef/orders", headers=_auth(chef["token"])).json()["data"]
    assert res["total"] == 2
    ids = {o["id"] for o in res["items"]}
    assert ids == {o1["id"], o2["id"]}
    assert res["items"][0]["team_name"] == "看板测试团"
    assert res["items"][0]["user"]["nickname"] == "点菜人"


def test_chef_orders_empty_for_non_chef(client: TestClient, seeded) -> None:
    chef, member, team, _ = _setup(client)
    res = client.get(f"{PREFIX}/chef/orders", headers=_auth(member["token"])).json()["data"]
    assert res["total"] == 0


def test_aggregated_groups_dishes_and_ingredients(client: TestClient, seeded) -> None:
    chef, member, team, (o1, o2) = _setup(client)
    agg = client.get(f"{PREFIX}/chef/orders/aggregated", headers=_auth(chef["token"])).json()["data"]
    assert agg["orders_count"] == 2

    # 第一道菜两笔订单合计 2+1=3，且为数量最大的菜，应排在首位
    top = agg["dishes"][0]
    assert top["total_quantity"] == 3
    assert isinstance(top["ingredients"], list)
    assert len(top["ingredients"]) > 0

    # 食材汇总非空、结构正确
    assert len(agg["ingredients"]) > 0
    assert {"name", "count"} <= set(agg["ingredients"][0].keys())