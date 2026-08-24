"""Task 5: Activities CRUD + 状态流转（二次确认由前端保证，后端幂等）。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    return data["token"], data["user"]


def test_activity_flow(client, seeded):
    """A创建团队→创建活动→列表可见→详情含空 items→状态流转 ordering→preparing→cooking→completed 依次成功，非法流转 400。"""
    token_a, user_a = _login(client, "活动A")
    token_b, user_b = _login(client, "外人B")

    # A 创建团队
    r = client.post("/api/v1/teams", json={"name": "活动团队"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    team_id = r.json()["data"]["id"]

    # 创建活动缺少 team 成员校验、type 校验、name 非空（由 Pydantic/业务兜底，后续补充边界用例）

    # 创建活动
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "daily", "name": "周一聚餐", "people": 3, "remark": "备注"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    act = r.json()["data"]
    act_id = act["id"]
    assert act["team_id"] == team_id
    assert act["type"] == "daily"
    assert act["name"] == "周一聚餐"
    assert act["status"] == "ordering"

    # 列表可见
    r = client.get("/api/v1/activities", params={"team_id": team_id}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["total"] >= 1
    ids = {it["id"] for it in data["items"]}
    assert act_id in ids

    # 详情含空 items 且有 members / ingredients / progress
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    detail = r.json()["data"]
    assert detail["id"] == act_id
    assert "members" in detail and len(detail["members"]) >= 1
    assert "items" in detail and detail["items"] == []
    assert "ingredients" in detail and detail["ingredients"] == []
    assert "progress" in detail
    assert detail["progress"]["status"] == "ordering"

    # 非成员不可见 40301
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_b))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 非成员创建活动 403
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "非法"},
        headers=_auth(token_b),
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 状态流转 ordering→preparing→cooking→completed 依次成功
    for target in ("preparing", "cooking", "completed"):
        r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": target}, headers=_auth(token_a))
        assert r.status_code == 200, f"target={target} {r.text}"
        assert r.json()["data"]["status"] == target
        # 详情同步
        assert client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]["status"] == target

    # 非法流转：completed → ordering
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "ordering"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 同状态幂等应 40003（已处于 completed）
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "completed"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003


def test_activity_create_validation(client, seeded):
    token_a, user_a = _login(client, "校验A")
    r = client.post("/api/v1/teams", json={"name": "校验团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]

    # type 非法
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "invalid", "name": "x"},
        headers=_auth(token_a),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40000

    # name 空白
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "daily", "name": "   "},
        headers=_auth(token_a),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40000

    # 非法跳级：ordering 直接到 cooking
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "跳级"},
        headers=_auth(token_a),
    )
    act_id = r.json()["data"]["id"]
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "cooking"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 未知 target
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "exploded"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003


def test_activity_ingredients_daily_party(client, db_session, seeded):
    """ingredients 计算：party 全 true，daily 按当前用户 fridge 判定 has。"""
    token_a, user_a = _login(client, "食材A")
    r = client.post("/api/v1/teams", json={"name": "食材团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]

    # 加一个常用食材到 fridge
    client.post("/api/v1/fridge", json={"name": "五花肉", "quantity": "1kg"}, headers=_auth(token_a))

    # 取一个含五花肉的菜品（红烧肉 ingredients 含五花肉、冰糖…）
    dish = client.get("/api/v1/dishes", params={"keyword": "红烧肉"}).json()["data"]["items"][0]

    # 创建 daily 活动并加菜（通过直接 DB 造 activity_items，避免依赖 Task6 接口）
    from app.models.activity import ActivityItem

    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "daily", "name": "日常食材"},
        headers=_auth(token_a),
    )
    act_daily = r.json()["data"]["id"]
    # 直接插入
    db_session.add(ActivityItem(activity_id=act_daily, dish_id=dish["id"], quantity=1, added_by=user_a["id"]))
    db_session.commit()

    r = client.get(f"/api/v1/activities/{act_daily}", headers=_auth(token_a))
    detail = r.json()["data"]
    assert len(detail["items"]) == 1
    # ingredients 应包含该菜的 ingredients，has 按 fridge 判定
    ing_map = {i["name"]: i["has"] for i in detail["ingredients"]}
    assert "五花肉" in ing_map
    assert ing_map["五花肉"] is True  # fridge 有
    # 冰糖 fridge 无 -> has False (daily)
    if "冰糖" in ing_map:
        assert ing_map["冰糖"] is False

    # party 活动：同菜但 has 全 true
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "聚餐食材"},
        headers=_auth(token_a),
    )
    act_party = r.json()["data"]["id"]
    db_session.add(ActivityItem(activity_id=act_party, dish_id=dish["id"], quantity=1, added_by=user_a["id"]))
    db_session.commit()
    r = client.get(f"/api/v1/activities/{act_party}", headers=_auth(token_a))
    detail = r.json()["data"]
    for ing in detail["ingredients"]:
        assert ing["has"] is True
