"""订单模块测试（M2.4）：全链路 —— 下单/取餐码/流转/越权/认领/列表/详情。"""

from __future__ import annotations

import secrets

from app.models.user import Team, TeamMember


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    data = r.json()["data"]
    return data["token"], data["user"]


def _new_invite_code() -> str:
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))


def _create_team(db, owner_id, name="测试团队", chef_id=None) -> Team:
    team = Team(name=name, invite_code=_new_invite_code(), owner_id=owner_id, chef_id=chef_id)
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=owner_id, role="organizer"))
    db.commit()
    db.refresh(team)
    return team


def _add_member(db, team_id, user_id, role="member") -> None:
    db.add(TeamMember(team_id=team_id, user_id=user_id, role=role))
    db.commit()


def _dish_by_name(client, name: str) -> dict:
    d = client.get("/api/v1/dishes", params={"keyword": name}).json()["data"]
    assert d["items"], f"未找到菜品 {name}"
    return d["items"][0]


def test_order_full_flow(client, db_session, seeded):
    token_a, user_a = _login(client, "点菜人A")
    token_b, user_b = _login(client, "厨师B")
    token_c, user_c = _login(client, "外人C")

    team = _create_team(db_session, user_a["id"])
    _add_member(db_session, team.id, user_b["id"])

    h_a, h_b, h_c = _auth(token_a), _auth(token_b), _auth(token_c)
    hsr = _dish_by_name(client, "红烧肉")
    xlh = _dish_by_name(client, "蒜蓉西兰花")

    # --- 第一单：取餐码 1001 ---
    r = client.post(
        "/api/v1/orders",
        json={
            "team_id": team.id,
            "items": [
                {"dish_id": hsr["id"], "quantity": 1},
                {"dish_id": xlh["id"], "quantity": 2},
            ],
        },
        headers=h_a,
    )
    assert r.status_code == 200
    o1 = r.json()["data"]
    assert o1["pickup_code"] == "1001"
    assert o1["status"] == "pending"
    assert o1["total_count"] == 3
    assert o1["total_amount"] == 52.0  # 28 + 12*2
    assert o1["team_name"] == "测试团队"
    assert len(o1["items"]) == 2

    # --- 同团队第二/三单：1002 / 1003 ---
    r = client.post(
        "/api/v1/orders",
        json={"team_id": team.id, "items": [{"dish_id": xlh["id"], "quantity": 1}]},
        headers=h_b,
    )
    o2 = r.json()["data"]
    assert o2["pickup_code"] == "1002"

    r = client.post(
        "/api/v1/orders",
        json={"team_id": team.id, "items": [{"dish_id": hsr["id"], "quantity": 1}]},
        headers=h_a,
    )
    o3 = r.json()["data"]
    assert o3["pickup_code"] == "1003"

    # --- 状态单向前进全链 ---
    r = client.post(f"/api/v1/orders/{o1['id']}/accept", headers=h_b)
    d = r.json()["data"]
    assert d["status"] == "accepted"
    assert d["chef_id"] == user_b["id"]  # 接单即记录厨师

    for target in ("cooking", "ready", "completed"):
        r = client.post(f"/api/v1/orders/{o1['id']}/status", json={"status": target}, headers=h_b)
        assert r.json()["data"]["status"] == target

    # --- 非法流转 ---
    # pending 直接跳到 cooking
    r = client.post(f"/api/v1/orders/{o2['id']}/status", json={"status": "cooking"}, headers=h_a)
    assert r.status_code == 400
    assert r.json()["code"] == 40003
    # completed 不可回退
    r = client.post(f"/api/v1/orders/{o1['id']}/status", json={"status": "ready"}, headers=h_a)
    assert r.json()["code"] == 40003
    # 未知状态
    r = client.post(f"/api/v1/orders/{o2['id']}/status", json={"status": "exploded"}, headers=h_a)
    assert r.json()["code"] == 40003

    # --- 越权访问 / 操作（非成员 40301）---
    r = client.get(f"/api/v1/orders/{o1['id']}", headers=h_c)
    assert r.status_code == 403
    assert r.json()["code"] == 40301
    r = client.post(f"/api/v1/orders/{o2['id']}/accept", headers=h_c)
    assert r.json()["code"] == 40301

    # --- 认领（团队无固定厨师）---
    r = client.post(f"/api/v1/orders/{o2['id']}/claim", headers=h_a)
    d = r.json()["data"]
    assert d["chef_id"] == user_a["id"]
    # 已被他人认领 -> 40004
    r = client.post(f"/api/v1/orders/{o2['id']}/claim", headers=h_b)
    assert r.json()["code"] == 40004

    # --- 团队设固定厨师后认领 -> 40002 ---
    team.chef_id = user_b["id"]
    db_session.commit()
    r = client.post(f"/api/v1/orders/{o3['id']}/claim", headers=h_a)
    assert r.json()["code"] == 40002

    # --- 我的订单列表（A 只有 o1、o3）---
    r = client.get("/api/v1/orders", headers=h_a)
    d = r.json()["data"]
    assert d["total"] == 2
    assert {it["id"] for it in d["items"]} == {o1["id"], o3["id"]}

    # 状态过滤：pending 只剩 o3
    r = client.get("/api/v1/orders", params={"status": "pending"}, headers=h_a)
    d = r.json()["data"]
    assert d["total"] == 1
    assert d["items"][0]["id"] == o3["id"]

    # --- 详情（同团队成员可看，含下单人昵称头像）---
    r = client.get(f"/api/v1/orders/{o3['id']}", headers=h_b)
    d = r.json()["data"]
    assert d["user"]["nickname"] == "点菜人A"
    assert d["team_name"] == "测试团队"
    assert d["user"]["id"] == user_a["id"]


def test_non_member_cannot_order(client, db_session, seeded):
    token_a, user_a = _login(client, "甲")
    token_c, user_c = _login(client, "丙")
    team = _create_team(db_session, user_a["id"])
    hsr = _dish_by_name(client, "红烧肉")

    r = client.post(
        "/api/v1/orders",
        json={"team_id": team.id, "items": [{"dish_id": hsr["id"], "quantity": 1}]},
        headers=_auth(token_c),
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_order_not_found(client, seeded):
    token, _ = _login(client)
    r = client.get("/api/v1/orders/99999", headers=_auth(token))
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_order_missing_dish_returns_40401(client, db_session, seeded):
    token_a, user_a = _login(client, "甲")
    team = _create_team(db_session, user_a["id"])

    r = client.post(
        "/api/v1/orders",
        json={"team_id": team.id, "items": [{"dish_id": 99999, "quantity": 1}]},
        headers=_auth(token_a),
    )
    assert r.status_code == 404
    assert r.json()["code"] == 40401