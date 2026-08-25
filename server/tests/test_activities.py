"""Task 5: Activities CRUD + 状态流转（二次确认由前端保证，后端幂等）。
Task 5+：活动阶段与单菜/食材进度联动——三闸门（无菜进备菜/无厨师开始制作/未完成点完成）、
单菜推进按活动阶段解锁、最后一菜 done 自动完成。"""

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
    """创建→点菜→指派厨师→逐阶段推进→全部菜 done 后自动 completed；三闸门分别拒绝。"""
    token_a, user_a = _login(client, "活动A")
    token_b, user_b = _login(client, "外人B")

    # A 创建团队
    r = client.post("/api/v1/teams", json={"name": "活动团队"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    team_id = r.json()["data"]["id"]

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
    assert act_id in {it["id"] for it in data["items"]}

    # 详情：ordering 进度为 0%
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    detail = r.json()["data"]
    assert detail["id"] == act_id
    assert "members" in detail and len(detail["members"]) >= 1
    assert "items" in detail and detail["items"] == []
    assert "ingredients" in detail and detail["ingredients"] == []
    assert detail["progress"]["status"] == "ordering"
    assert detail["progress"]["percent"] == 0

    # 非成员不可见 40301
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_b))
    assert r.status_code == 403
    assert r.json()["code"] == 40301
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "非法"},
        headers=_auth(token_b),
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 闸门①：还没点菜不能进入备菜
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "preparing"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 点两道菜（A 全点，不指派厨师）
    dishes = client.get("/api/v1/dishes").json()["data"]["items"]
    item_ids = []
    for d in dishes[:2]:
        r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": d["id"], "quantity": 1}, headers=_auth(token_a))
        assert r.status_code == 200, r.text
        item_ids.append(r.json()["data"]["id"])

    # 有菜后可进入备菜；preparing 进度由食材备齐率推导（5%→40%）
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "preparing"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text
    detail_p = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]
    assert detail_p["status"] == "preparing"
    assert 5 <= detail_p["progress"]["percent"] <= 40
    assert detail_p["progress"]["ingredients_total"] >= 1

    # 闸门②：还有菜没有厨师，不能开始制作
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "cooking"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 指派厨师（A 自己，两道菜）
    for it_id in item_ids:
        r = client.put(f"/api/v1/activities/{act_id}/items/{it_id}/chef", json={"user_id": user_a["id"]}, headers=_auth(token_a))
        assert r.status_code == 200, r.text

    # 开始制作
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "cooking"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # 第一道菜做完：仍 cooking；手工点"完成"被拒（闸门③）
    for t in ("prepared", "cooking", "done"):
        r = client.put(f"/api/v1/activities/{act_id}/items/{item_ids[0]}/status", json={"target": t}, headers=_auth(token_a))
        assert r.status_code == 200, f"target={t} {r.text}"
    detail_c = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]
    assert detail_c["status"] == "cooking"
    assert 45 <= detail_c["progress"]["percent"] <= 90
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "completed"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 第二道菜做完 → 自动 completed
    for t in ("prepared", "cooking", "done"):
        r = client.put(f"/api/v1/activities/{act_id}/items/{item_ids[1]}/status", json={"target": t}, headers=_auth(token_a))
        assert r.status_code == 200, f"target={t} {r.text}"
    detail_done = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]
    assert detail_done["status"] == "completed"
    assert detail_done["progress"]["percent"] == 100
    assert detail_done["progress"]["done"] == 2

    # 非法流转：completed → ordering / 同状态幂等均 40003
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "ordering"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "completed"}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40003


def test_activity_auto_complete(client, seeded):
    """两菜场景：完成一道仍 cooking 且手工完成被拒；完成最后一道自动 completed。"""
    token_a, user_a = _login(client, "自动A")
    r = client.post("/api/v1/teams", json={"name": "自动团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]
    r = client.post("/api/v1/activities", json={"team_id": team_id, "type": "party", "name": "自动活动"}, headers=_auth(token_a))
    act_id = r.json()["data"]["id"]

    dishes = client.get("/api/v1/dishes").json()["data"]["items"]
    item_ids = []
    for d in dishes[:2]:
        r = client.post(f"/api/v1/activities/{act_id}/items", json={"dish_id": d["id"], "quantity": 1}, headers=_auth(token_a))
        item_ids.append(r.json()["data"]["id"])
    for it_id in item_ids:
        client.put(f"/api/v1/activities/{act_id}/items/{it_id}/chef", json={"user_id": user_a["id"]}, headers=_auth(token_a))
    # 快速推进到烹饪
    for t in ("preparing", "cooking"):
        assert client.post(f"/api/v1/activities/{act_id}/status", json={"target": t}, headers=_auth(token_a)).status_code == 200

    # 完成第一道：仍 cooking
    item1, item2 = item_ids
    for t in ("prepared", "cooking", "done"):
        r = client.put(f"/api/v1/activities/{act_id}/items/{item1}/status", json={"target": t}, headers=_auth(token_a))
        assert r.status_code == 200
    assert client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]["status"] == "cooking"

    # 完成第二道：自动 completed（活动状态无需手动流转）
    for t in ("prepared", "cooking", "done"):
        r = client.put(f"/api/v1/activities/{act_id}/items/{item2}/status", json={"target": t}, headers=_auth(token_a))
        assert r.status_code == 200
    assert client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]["status"] == "completed"


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
    """A点菜→同人同菜累加→B同菜独立→改厨师→单菜推进按活动阶段解锁→非法推进失败→删除权限。"""
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

    # 重新设回 B 供后续状态流转；非团队成员设为厨师 40002
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": user_b["id"]}, headers=_auth(token_a))
    assert r.status_code == 200
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/chef", json={"user_id": 999999}, headers=_auth(token_a))
    assert r.status_code == 400
    assert r.json()["code"] == 40002

    # 单菜状态权限：仅有效厨师可推（A 推应 403）
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_a))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 阶段解锁：活动还在 ordering，B（厨师）推 prepared 应 40003
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_b))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 进入备菜（有菜即可）
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "preparing"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # B 推进 pending->prepared 成功
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "prepared"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "prepared"

    # 阶段解锁：preparing 阶段不能推进到 cooking（须活动进入 cooking）
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "cooking"}, headers=_auth(token_b))
    assert r.status_code == 400
    assert r.json()["code"] == 40003

    # 两道菜都要有厨师才能开始制作：B 把 item_b 也指派给自己
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_b_id}/chef", json={"user_id": user_b["id"]}, headers=_auth(token_b))
    assert r.status_code == 200

    # 进入 cooking
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "cooking"}, headers=_auth(token_a))
    assert r.status_code == 200, r.text

    # B 继续 prepared->cooking->done
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "cooking"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "cooking"
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_a_id}/status", json={"target": "done"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "done"
    # item_b 未完成 → 活动仍 cooking（不自动完成）
    assert client.get(f"/api/v1/activities/{act_id}", headers=_auth(token_a)).json()["data"]["status"] == "cooking"

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
    """team.chef_id 回落：item.chef_id 为 null 时有效厨师为 team.chef_id；推进需活动进入备菜阶段。"""
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

    # A 推进活动进入备菜（team 固定厨师回落满足"有厨师"，但仅对 cooking 闸门生效）
    r = client.post(f"/api/v1/activities/{act_id}/status", json={"target": "preparing"}, headers=_auth(token_a))
    assert r.status_code == 200

    # A 推进成功（回落 chef=A 且进入备菜阶段）
    r = client.put(f"/api/v1/activities/{act_id}/items/{item_id}/status", json={"target": "prepared"}, headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "prepared"