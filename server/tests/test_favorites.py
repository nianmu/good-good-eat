"""收藏模块测试（四期）：收藏 / 重复幂等 / 取消 / 列表 / my stats 计数。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    data = r.json()["data"]
    return data["token"], data["user"]


def _dish_id_by_name(client, name: str) -> int:
    d = client.get("/api/v1/dishes", params={"keyword": name}).json()["data"]
    assert d["items"], f"未找到菜品 {name}"
    return d["items"][0]["id"]


def test_favorite_and_duplicate_idempotent(client, seeded):
    token, user = _login(client)
    h = _auth(token)
    hsr_id = _dish_id_by_name(client, "红烧肉")

    r = client.post(f"/api/v1/dishes/{hsr_id}/favorite", headers=h)
    assert r.status_code == 200
    assert r.json()["data"] == {"dish_id": hsr_id, "favorited": True}

    # 重复收藏幂等，仍返回当前态
    r2 = client.post(f"/api/v1/dishes/{hsr_id}/favorite", headers=h)
    assert r2.status_code == 200
    assert r2.json()["data"]["favorited"] is True

    # my stats 计数
    me = client.get("/api/v1/me", headers=h).json()["data"]["user"]
    assert me["stats"]["favorite_dishes"] == 1


def test_favorite_dish_not_found(client, seeded):
    token, _ = _login(client)
    r = client.post("/api/v1/dishes/99999/favorite", headers=_auth(token))
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_unfavorite(client, seeded):
    token, _ = _login(client)
    h = _auth(token)
    hsr_id = _dish_id_by_name(client, "红烧肉")

    client.post(f"/api/v1/dishes/{hsr_id}/favorite", headers=h)
    r = client.delete(f"/api/v1/dishes/{hsr_id}/favorite", headers=h)
    assert r.status_code == 200
    assert r.json()["data"]["favorited"] is False

    # 未收藏时取消 → 40022
    r2 = client.delete(f"/api/v1/dishes/{hsr_id}/favorite", headers=h)
    assert r2.status_code == 400
    assert r2.json()["code"] == 40022


def test_favorites_list_pagination(client, seeded):
    token, _ = _login(client)
    h = _auth(token)
    ids = [_dish_id_by_name(client, n) for n in ["红烧肉", "可乐鸡翅", "蛋炒饭"]]
    for i in ids:
        client.post(f"/api/v1/dishes/{i}/favorite", headers=h)

    r = client.get("/api/v1/favorites", headers=h)
    d = r.json()["data"]
    assert d["total"] == 3
    names = {it["name"] for it in d["items"]}
    assert names == {"红烧肉", "可乐鸡翅", "蛋炒饭"}

    # 分页
    r2 = client.get("/api/v1/favorites", params={"page": 1, "page_size": 2}, headers=h)
    assert r2.json()["data"]["total"] == 3
    assert len(r2.json()["data"]["items"]) == 2


def test_favorites_require_auth(client, seeded):
    r = client.get("/api/v1/favorites")
    assert r.status_code == 401
    assert r.json()["code"] == 40101
