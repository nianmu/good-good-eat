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


def test_activity_items_flow(client, seeded):
    """A点菜→同人同菜累加→B同菜独立→改厨师为B→B推进状态→非法推进失败→删除权限。"""
    token_a, user_a = _login(client, "点菜A")
    token_b, user_b = _login(client, "点菜B")

    # A 创建团队，B 加入
    r = client.post("/api/v1/teams", json={"name": "点菜团队"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    team_id = r.json()["data"]["id"]
    invite = r.json()["data"]["invite_code"]
    r = client.post("/api/v1/teams/join", json={"invite_code": invite}, headers=_auth(token_b))
    assert r.status_code == 200, r.text

    # A 创建活动
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "daily", "name": "点菜活动"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    act_id = r.json()["data"]["id"]

    dish = client.get("/api/v1/dishes", params={"keyword": "红烧肉"}).json()["data"]["items"][0]
    dish_id = dish["id"]

    # A 点菜 quantity 2
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 2}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    item_a = r.json()["data"]
    assert item_a["dish_id"] == dish_id
    assert item_a["quantity"] == 2
    assert item_a["added_by"] == user_a["id"]
    item_a_id = item_a["id"]

    # A 同菜累加 quantity 3 -> 应累加到 5，id 不变
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 3}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    item_a2 = r.json()["data"]
    assert item_a2["id"] == item_a_id
    assert item_a2["quantity"] == 5

    # B 同菜独立一行
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    item_b = r.json()["data"]
    assert item_b["added_by"] == user_b["id"]
    assert item_b["id"] != item_a_id
    assert item_b["quantity"] == 1
    item_b_id = item_b["id"]

    # 详情应有 2 行
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a))
    assert len(r.json()["data"]["items"]) == 2

    # 校验 dish 不存在 / inactive
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": 999999, "quantity": 1}, headers=_auth(token_a))
    assert r.status_code == 404
    assert r.json()["code"] == 40401
    # quantity 非法 (pydantic 422)
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 0}, headers=_auth(token_a))
    assert r.status_code == 422
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1000}, headers=_auth(token_a))
    assert r.status_code == 422

    # 改厨师：B 将自己的菜改自己为厨师（任意成员可改自己）
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_b_id}/chef", json={"user_id": user_b["id"]}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["chef_id"] == user_b["id"]

    # A（组织者）将 A 的菜改厨师为 B
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": user_b["id"]}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["chef_id"] == user_b["id"]

    # B（非组织者）试图将 A 的菜改给 A（他人） -> 403
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": user_a["id"]}, headers=_auth(token_b))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 清空回落：B 清空自己的 chef
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_b_id}/chef", json={"user_id": None}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["chef_id"] is None

    # 重新设回 B 供后续状态流转
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": user_b["id"]}, headers=_auth(token_a))
    assert r.status_code == 200
    # 非团队成员设为厨师 40002
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": 999999}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40002

    # 单菜状态：设回后仅 B 可推，A 推应 403
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_a))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # B 推进 pending->prepared 成功
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "prepared"

    # B 继续 prepared->cooking->done
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "cooking"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "cooking"
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "done"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "done"

    # 非法流转：done 再推 prepared 40003
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_b))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 非法跳级：新建菜 pending 直接到 cooking 40003
    # 用另一道菜
    dish2 = client.get("/api/v1/dishes", params={"keyword": "西红柿炒鸡蛋"}).json()["data"]["items"][0]
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish2["id"], "quantity": 1}, headers=_auth(token_a))
    assert r.status_code == 200
    item_c_id = r.json()["data"]["id"]
    # 先设厨师为 A 自身
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_c_id}/chef", json={"user_id": user_a["id"]}, headers=_auth(token_a))
    assert r.status_code == 200
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_c_id}/status", json={"target": "cooking"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003
    # 未知 target 40003
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_c_id}/status", json={"target": "exploded"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003


def test_activity_item_delete_and_permissions(client, seeded):
    """移除：仅 added_by 或组织者可删；非成员不可操作。"""
    token_a, user_a = _login(client, "删A")
    token_b, user_b = _login(client, "删B")
    token_c, user_c = _login(client, "外人C")

    r = client.post("/api/v1/teams", json={"name": "删团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]
    invite = r.json()["data"]["invite_code"]
    client.post("/api/v1/teams/join", json={"invite_code": invite}, headers=_auth(token_b))

    r = client.post("/api/v1/activities", json={"team_id": team_id, "type": "daily", "name": "删活动"}, headers=_auth(token_a))
    act_id = r.json()["data"]["id"]
    dish = client.get("/api/v1/dishes").json()["data"]["items"][0]
    dish_id = dish["id"]

    # A 点菜
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1}, headers=_auth(token_a))
    item_a_id = r.json()["data"]["id"]
    # B 点菜
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1}, headers=_auth(token_b))
    item_b_id = r.json()["data"]["id"]

    # B 尝试删 A 的菜 -> 403
    r = client.delete(f"/api/v1/activities/{act_id}/items/{item_a_id}", headers=_auth(token_b))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # A（组织者）删 B 的菜 -> 成功
    r = client.delete(f"/api/v1/activities/{act_id}/items/{item_b_id}", headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # B 再点一个，B 自己删成功
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1}, headers=_auth(token_b))
    item_b2 = r.json()["data"]["id"]
    r = client.delete(f"/api/v1/activities/{act_id}/items/{item_b2}", headers=_auth(token_b))
    assert r.status_code == 200

    # 外人删 -> 403
    r = client.delete(f"/api/v1/activities/{act_id}/items/{item_a_id}", headers=_auth(token_c))
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_activity_item_chef_fallback_team_chef(client, db_session, seeded):
    """team.chef_id 回落：item.chef_id 为 null 时有效厨师为 team.chef_id。"""
    token_a, user_a = _login(client, "回落A")
    token_b, user_b = _login(client, "回落B")

    r = client.post("/api/v1/teams", json={"name": "回落团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]
    invite = r.json()["data"]["invite_code"]
    client.post("/api/v1/teams/join", json={"invite_code": invite}, headers=_auth(token_b))
    # 设固定厨师为 A
    r = client.put(f"/api/v1/teams/{team_id}/chef", json={"user_id": user_a["id"]}, headers=_auth(token_a))
    assert r.status_code == 200

    r = client.post("/api/v1/activities", json={"team_id": team_id, "type": "daily", "name": "回落活动"}, headers=_auth(token_a))
    act_id = r.json()["data"]["id"]
    dish = client.get("/api/v1/dishes").json()["data"]["items"][0]
    dish_id = dish["id"]

    # B 点菜，不设厨师（null 回落 team.chef_id=A）
    r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": dish_id, "quantity": 1}, headers=_auth(token_b))
    item_id = r.json()["data"]["id"]

    # B 尝试推进 -> 403（有效厨师是 A）
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_id}/status", json={"target": "prepared"}, headers=_auth(token_b))
    assert r.status_code == 403

    # A 推进成功
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_id}/status", json={"target": "prepared"}, headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "prepared"
