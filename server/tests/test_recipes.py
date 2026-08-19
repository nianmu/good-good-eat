"""菜谱库测试（四期）：建 / 查 / 改 / 删本人私有菜谱；他人无权 40301。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    data = r.json()["data"]
    return data["token"], data["user"]


def _recipe_payload(name="家庭红烧肉", ingredients=None, steps=None):
    return {
        "name": name,
        "emoji": "🥘",
        "color": "#FFAB91",
        "description": "家常做法",
        "ingredients": ingredients or ["五花肉", "冰糖", "生抽"],
        "steps": steps or ["切肉焯水", "炒糖色下肉", "小火慢炖"],
        "cook_time": 60,
        "difficulty": "中等",
    }


def test_recipe_crud_own(client, seeded):
    token, user = _login(client, "菜谱作者")
    h = _auth(token)

    # 建
    r = client.post("/api/v1/recipes", json=_recipe_payload(), headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    rid = data["id"]
    assert data["user_id"] == user["id"]
    assert data["name"] == "家庭红烧肉"
    assert data["steps"] == ["切肉焯水", "炒糖色下肉", "小火慢炖"]
    assert data["is_public"] is False

    # 查详情
    r2 = client.get(f"/api/v1/recipes/{rid}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["data"]["cook_time"] == 60

    # 列表（owner=me）
    r3 = client.get("/api/v1/recipes", params={"owner": "me"}, headers=h)
    d = r3.json()["data"]
    assert d["total"] == 1
    assert d["items"][0]["id"] == rid

    # 改
    payload = _recipe_payload(name="升级版红烧肉", ingredients=["五花肉", "冰糖", "八角"])
    r4 = client.put(f"/api/v1/recipes/{rid}", json=payload, headers=h)
    assert r4.status_code == 200
    assert r4.json()["data"]["name"] == "升级版红烧肉"
    assert r4.json()["data"]["ingredients"] == ["五花肉", "冰糖", "八角"]

    # 删
    r5 = client.delete(f"/api/v1/recipes/{rid}", headers=h)
    assert r5.status_code == 200
    r6 = client.get("/api/v1/recipes", params={"owner": "me"}, headers=h)
    assert r6.json()["data"]["total"] == 0


def test_recipe_list_owner_only(client, seeded):
    token, _ = _login(client)
    h = _auth(token)
    r = client.get("/api/v1/recipes", params={"owner": "public"}, headers=h)
    assert r.status_code == 400
    assert r.json()["code"] == 40020


def test_recipe_forbidden_for_others(client, seeded):
    t1, _ = _login(client, "作者甲")
    rid = client.post("/api/v1/recipes", json=_recipe_payload(), headers=_auth(t1)).json()["data"]["id"]

    t2, _ = _login(client, "外人乙")
    h2 = _auth(t2)

    # 私有菜谱他人不可见 → 40301
    r = client.get(f"/api/v1/recipes/{rid}", headers=h2)
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    # 他人不可改 / 不可删
    r2 = client.put(f"/api/v1/recipes/{rid}", json=_recipe_payload(), headers=h2)
    assert r2.status_code == 403
    assert r2.json()["code"] == 40301
    r3 = client.delete(f"/api/v1/recipes/{rid}", headers=h2)
    assert r3.status_code == 403


def test_recipe_404(client, seeded):
    token, _ = _login(client)
    r = client.get("/api/v1/recipes/99999", headers=_auth(token))
    assert r.status_code == 404
    assert r.json()["code"] == 40401
