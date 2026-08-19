"""饮食计划测试（五期）：保存 / 列表分页 / 详情 / 删除 / 越权。"""

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


def _plan_payload(client, name="一周菜谱"):
    return {
        "name": name,
        "note": "家庭周计划",
        "items": [
            {"dish_id": _dish_id_by_name(client, "红烧肉"), "quantity": 1},
            {"dish_id": _dish_id_by_name(client, "蒜蓉西兰花"), "quantity": 2},
            {"dish_id": _dish_id_by_name(client, "番茄蛋花汤"), "quantity": 1},
        ],
    }


def test_plan_create_and_detail(client, seeded):
    token, user = _login(client, "计划作者")
    h = _auth(token)

    r = client.post("/api/v1/plans", json=_plan_payload(client), headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    pid = data["id"]
    assert data["user_id"] == user["id"]
    assert data["name"] == "一周菜谱"
    assert data["created_at"]
    # 重复 dish 合并 + 数量合计
    assert data["total_count"] == 4  # 1+2+1
    names = [it["dish"]["name"] for it in data["items"]]
    assert "红烧肉" in names and "蒜蓉西兰花" in names

    # 详情
    r2 = client.get(f"/api/v1/plans/{pid}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["data"]["id"] == pid


def test_plan_list_pagination(client, seeded):
    token, _ = _login(client)
    h = _auth(token)
    for i in range(3):
        client.post("/api/v1/plans", json=_plan_payload(client, name=f"计划{i}"), headers=h)

    r = client.get("/api/v1/plans", headers=h)
    d = r.json()["data"]
    assert d["total"] == 3
    names = {it["name"] for it in d["items"]}
    assert names == {"计划0", "计划1", "计划2"}
    # 列表含菜品摘要
    assert d["items"][0]["summary"][0]["name"]
    assert d["items"][0]["summary"][0]["emoji"]

    r2 = client.get("/api/v1/plans", params={"page": 1, "page_size": 2}, headers=h)
    assert r2.json()["data"]["total"] == 3
    assert len(r2.json()["data"]["items"]) == 2


def test_plan_delete(client, seeded):
    token, _ = _login(client)
    h = _auth(token)
    pid = client.post("/api/v1/plans", json=_plan_payload(client), headers=h).json()["data"]["id"]

    r = client.delete(f"/api/v1/plans/{pid}", headers=h)
    assert r.status_code == 200
    assert r.json()["data"] == {"id": pid}

    r2 = client.get("/api/v1/plans", headers=h)
    assert r2.json()["data"]["total"] == 0


def test_plan_forbidden_for_others(client, seeded):
    t1, _ = _login(client, "作者甲")
    pid = client.post("/api/v1/plans", json=_plan_payload(client), headers=_auth(t1)).json()["data"]["id"]

    t2, _ = _login(client, "外人乙")
    h2 = _auth(t2)
    r = client.get(f"/api/v1/plans/{pid}", headers=h2)
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    r2 = client.delete(f"/api/v1/plans/{pid}", headers=h2)
    assert r2.status_code == 403


def test_plan_invalid_dish_404(client, seeded):
    token, _ = _login(client)
    r = client.post(
        "/api/v1/plans",
        json={"name": "坏计划", "items": [{"dish_id": 99999, "quantity": 1}]},
        headers=_auth(token),
    )
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_plans_require_auth(client, seeded):
    r = client.get("/api/v1/plans")
    assert r.status_code == 401
    assert r.json()["code"] == 40101
