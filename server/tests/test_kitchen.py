"""厨房模块测试（四期）：冰箱增删 / 菜篮增删勾选 / fridge/suggest 推荐命中。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    data = r.json()["data"]
    return data["token"], data["user"]


def test_fridge_add_upsert_delete(client, seeded):
    token, _ = _login(client, "厨房主人")
    h = _auth(token)

    r = client.post("/api/v1/fridge", json={"name": "五花肉", "quantity": "500g"}, headers=h)
    assert r.status_code == 200
    item_id = r.json()["data"]["id"]

    # 同名覆盖 quantity
    r2 = client.post("/api/v1/fridge", json={"name": "五花肉", "quantity": "1kg"}, headers=h)
    assert r2.status_code == 200
    assert r2.json()["data"]["quantity"] == "1kg"

    # 列表
    r3 = client.get("/api/v1/fridge", headers=h)
    assert r3.json()["data"][0]["name"] == "五花肉"

    # 删
    r4 = client.delete(f"/api/v1/fridge/{item_id}", headers=h)
    assert r4.status_code == 200
    assert client.get("/api/v1/fridge", headers=h).json()["data"] == []


def test_basket_check_toggle_delete(client, seeded):
    token, _ = _login(client, "菜篮主人")
    h = _auth(token)

    r = client.post("/api/v1/basket", json={"name": "鸡蛋", "quantity": "10个"}, headers=h)
    item_id = r.json()["data"]["id"]

    # 同名合并（不新增）
    client.post("/api/v1/basket", json={"name": "鸡蛋", "quantity": ""}, headers=h)
    lst = client.get("/api/v1/basket", headers=h).json()["data"]
    assert len(lst) == 1

    # 勾选完成
    r2 = client.put(f"/api/v1/basket/{item_id}", json={"checked": True}, headers=h)
    assert r2.json()["data"]["checked"] is True

    # 取消勾选
    r3 = client.put(f"/api/v1/basket/{item_id}", json={"checked": False}, headers=h)
    assert r3.json()["data"]["checked"] is False

    # 删
    r4 = client.delete(f"/api/v1/basket/{item_id}", headers=h)
    assert r4.status_code == 200
    assert client.get("/api/v1/basket", headers=h).json()["data"] == []


def test_basket_check_not_found(client, seeded):
    token, _ = _login(client)
    r = client.put("/api/v1/basket/99999", json={"checked": True}, headers=_auth(token))
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_fridge_suggest_matches_seeded_dish(client, seeded):
    """冰箱加「五花肉」「冰糖」应命中种子菜品「红烧肉」（食材含两者）。"""
    token, _ = _login(client, "冰箱主人")
    h = _auth(token)
    client.post("/api/v1/fridge", json={"name": "五花肉", "quantity": "1"}, headers=h)
    client.post("/api/v1/fridge", json={"name": "冰糖", "quantity": "1"}, headers=h)

    r = client.get("/api/v1/fridge/suggest", headers=h)
    assert r.status_code == 200
    items = r.json()["data"]
    hsr = next((it for it in items if it["name"] == "红烧肉"), None)
    assert hsr is not None, f"应命中红烧肉，实际 {items}"
    assert hsr["source"] == "dish"
    assert set(hsr["matched"]) == {"五花肉", "冰糖"}
    assert len(hsr["matched"]) >= 2


def test_fridge_suggest_no_match_empty(client, seeded):
    token, _ = _login(client, "空冰箱")
    h = _auth(token)
    client.post("/api/v1/fridge", json={"name": "榴莲", "quantity": "1"}, headers=h)
    r = client.get("/api/v1/fridge/suggest", headers=h)
    assert r.json()["data"] == []
