"""食材备齐状态：创建活动 → 加菜 → 食材列表 → 切换备齐 → 详情返回 is_ready。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    return data["token"], data["user"]


def test_ingredients_full_flow(client, seeded):
    """创建活动 → 加菜 → 食材自动同步 → 列表返回 → 切换备齐 → 详情含 is_ready。"""
    token, user = _login(client, "食材测试")
    r = client.post("/api/v1/teams", json={"name": "食材团队"}, headers=_auth(token))
    team_id = r.json()["data"]["id"]

    # 创建活动
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "备齐测试"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    act_id = r.json()["data"]["id"]

    # 初始无菜品 → 食材列表为空
    r = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["data"] == []

    # 加菜：取一个有 ingredients 的菜品
    dish = client.get("/api/v1/dishes", params={"keyword": "红烧肉"}).json()["data"]["items"][0]
    assert dish is None or dish.get("id") is not None
    r = client.post(
        f"/api/v1/activities/{act_id}/items",
        json={"dish_id": dish["id"], "quantity": 1},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text

    # 食材列表应自动同步
    r = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token))
    assert r.status_code == 200, r.text
    ingredients = r.json()["data"]
    assert len(ingredients) > 0, "加菜后应有食材记录"
    # 每个食材有 name 和 is_ready 字段
    for ing in ingredients:
        assert "name" in ing
        assert "is_ready" in ing
        assert ing["is_ready"] is False, "初始应为未备齐"

    # 切换第一个食材为已备齐
    first_name = ingredients[0]["name"]
    r = client.put(
        f"/api/v1/activities/{act_id}/ingredients/{first_name}/ready",
        json={"is_ready": True},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["name"] == first_name
    assert data["is_ready"] is True

    # 再次获取食材列表验证状态已更新
    r = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token))
    updated = r.json()["data"]
    ready_items = [i for i in updated if i["name"] == first_name]
    assert len(ready_items) == 1
    assert ready_items[0]["is_ready"] is True
    # 其余食材仍为未备齐
    other_items = [i for i in updated if i["name"] != first_name]
    for i in other_items:
        assert i["is_ready"] is False

    # 详情接口返回的 ingredients 含 is_ready
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token))
    assert r.status_code == 200, r.text
    detail_ingredients = r.json()["data"]["ingredients"]
    assert len(detail_ingredients) > 0
    found_ready = [i for i in detail_ingredients if i["name"] == first_name]
    assert len(found_ready) == 1
    assert found_ready[0]["is_ready"] is True
    # has 字段向后兼容，与 is_ready 同值
    assert found_ready[0]["has"] is True

    # 切换回未备齐
    r = client.put(
        f"/api/v1/activities/{act_id}/ingredients/{first_name}/ready",
        json={"is_ready": False},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["is_ready"] is False


def test_ingredients_second_dish_supplements(client, seeded):
    """加第二道菜时，新食材自动补充到 activity_ingredients，已有食材不受影响。"""
    token, user = _login(client, "加菜补食材")
    r = client.post("/api/v1/teams", json={"name": "补食材团队"}, headers=_auth(token))
    team_id = r.json()["data"]["id"]

    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "daily", "name": "加菜测试"},
        headers=_auth(token),
    )
    act_id = r.json()["data"]["id"]

    # 取两道不同菜品
    dishes = client.get("/api/v1/dishes").json()["data"]["items"]
    dish_a = dishes[0]
    dish_b = dishes[1]

    # 加第一道菜
    r = client.post(
        f"/api/v1/activities/{act_id}/items",
        json={"dish_id": dish_a["id"], "quantity": 1},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    r1 = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token))
    names_a = {i["name"] for i in r1.json()["data"]}

    # 加第二道菜
    r = client.post(
        f"/api/v1/activities/{act_id}/items",
        json={"dish_id": dish_b["id"], "quantity": 1},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    r2 = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token))
    names_b = {i["name"] for i in r2.json()["data"]}

    # 第二道菜的食材数量应 >= 第一道
    assert len(names_b) >= len(names_a)
    # 原食材名仍存在
    for n in names_a:
        assert n in names_b


def test_ingredients_non_member_403(client, seeded):
    """非成员不可访问食材列表/切换状态。"""
    token_a, _ = _login(client, "食材权限A")
    token_b, _ = _login(client, "食材外人B")

    r = client.post("/api/v1/teams", json={"name": "权限团队"}, headers=_auth(token_a))
    team_id = r.json()["data"]["id"]

    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "权限测试"},
        headers=_auth(token_a),
    )
    act_id = r.json()["data"]["id"]

    # 外人访问食材列表 → 403
    r = client.get(f"/api/v1/activities/{act_id}/ingredients", headers=_auth(token_b))
    assert r.status_code == 403

    # 外人切换食材状态 → 403
    r = client.put(
        f"/api/v1/activities/{act_id}/ingredients/xxx/ready",
        json={"is_ready": True},
        headers=_auth(token_b),
    )
    assert r.status_code == 403


def test_ingredients_nonexistent_404(client, seeded):
    """不存在的食材名 → 404。"""
    token, _ = _login(client, "404食材")
    r = client.post("/api/v1/teams", json={"name": "404团队"}, headers=_auth(token))
    team_id = r.json()["data"]["id"]

    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "404测试"},
        headers=_auth(token),
    )
    act_id = r.json()["data"]["id"]

    r = client.put(
        f"/api/v1/activities/{act_id}/ingredients/不存在的食材/ready",
        json={"is_ready": True},
        headers=_auth(token),
    )
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_ingredients_has_backward_compat(client, db_session, seeded):
    """详情接口返回的 ingredients 中 has 字段与 is_ready 同值（向后兼容）。"""
    from app.models.activity import ActivityItem

    token, user = _login(client, "兼容测试")
    r = client.post("/api/v1/teams", json={"name": "兼容团队"}, headers=_auth(token))
    team_id = r.json()["data"]["id"]

    r = client.post(
        "/api/v1/activities",
        json={"team_id": team_id, "type": "party", "name": "兼容活动"},
        headers=_auth(token),
    )
    act_id = r.json()["data"]["id"]

    dish = client.get("/api/v1/dishes", params={"keyword": "红烧肉"}).json()["data"]["items"][0]
    db_session.add(ActivityItem(activity_id=act_id, dish_id=dish["id"], quantity=1, added_by=user["id"]))
    db_session.commit()

    # 手动设一个食材为已备齐
    client.put(
        f"/api/v1/activities/{act_id}/ingredients/五花肉/ready",
        json={"is_ready": True},
        headers=_auth(token),
    )

    # 详情接口
    r = client.get(f"/api/v1/activities/{act_id}", headers=_auth(token))
    ingredients = r.json()["data"]["ingredients"]
    for ing in ingredients:
        assert ing["has"] == ing["is_ready"], f"has/is_ready 不一致: {ing}"
