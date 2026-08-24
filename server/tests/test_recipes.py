"""菜谱库测试（最终版）：CRUD / 公开菜谱库 / 菜谱收藏 / 菜品→菜谱跳转。"""

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

    # 列表（owner=me，仅本人）
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


def test_recipe_public_library(client, seeded):
    """公开菜谱库：owner=public 游客可浏览；me/all 需登录。"""
    # 无登录可浏览公开菜谱
    r = client.get("/api/v1/recipes", params={"owner": "public"})
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["total"] == 50
    assert all(it["is_public"] for it in d["items"])
    assert all(it["author"] for it in d["items"])
    assert any(it["steps"] for it in d["items"])

    # owner=me / all 需登录
    assert client.get("/api/v1/recipes", params={"owner": "me"}).status_code == 401
    assert client.get("/api/v1/recipes", params={"owner": "all"}).status_code == 401


def test_recipe_public_viewable_without_auth(client, seeded):
    """公开菜谱详情：游客可直接访问。"""
    pub = client.get("/api/v1/recipes", params={"owner": "public"}).json()["data"]["items"][0]
    r = client.get(f"/api/v1/recipes/{pub['id']}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["name"] == pub["name"]
    assert data["is_public"] is True


def test_recipe_favorite_flow(client, seeded):
    """菜谱收藏：收藏 / 列表 / 详情 is_favorite / 取消。"""
    token, _ = _login(client, "收藏者")
    h = _auth(token)
    pub = client.get("/api/v1/recipes", params={"owner": "public"}).json()["data"]["items"][0]
    rid = pub["id"]

    r = client.post(f"/api/v1/recipes/{rid}/favorite", headers=h)
    assert r.status_code == 200
    assert r.json()["data"]["favorited"] is True

    lst = client.get("/api/v1/recipes/favorites", headers=h).json()["data"]["items"]
    assert any(it["id"] == rid for it in lst)

    detail = client.get(f"/api/v1/recipes/{rid}", headers=h).json()["data"]
    assert detail["is_favorite"] is True

    r4 = client.delete(f"/api/v1/recipes/{rid}/favorite", headers=h)
    assert r4.status_code == 200
    assert r4.json()["data"]["favorited"] is False
    lst2 = client.get("/api/v1/recipes/favorites", headers=h).json()["data"]["items"]
    assert not any(it["id"] == rid for it in lst2)


def test_recipe_favorite_private_forbidden(client, seeded):
    """私有菜谱不能被他人收藏 → 40301。"""
    t1, _ = _login(client, "作者")
    rid = client.post("/api/v1/recipes", json=_recipe_payload(), headers=_auth(t1)).json()["data"]["id"]
    t2, _ = _login(client, "旁人")
    r = client.post(f"/api/v1/recipes/{rid}/favorite", headers=_auth(t2))
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_dish_recipe_lookup(client, seeded):
    """菜单菜品 → 公开菜谱跳转。"""
    dish = client.get("/api/v1/dishes", params={"keyword": "红烧肉"}).json()["data"]["items"][0]
    r = client.get(f"/api/v1/recipes/by-dish/{dish['id']}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data is not None
    assert data["dish_id"] == dish["id"]
    assert data["is_public"] is True
    assert data["steps"]


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
