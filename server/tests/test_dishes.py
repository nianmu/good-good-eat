"""菜品模块测试（M2.3）：分类 / 列表分页 / 搜索 / 详情 / 40401。"""

from __future__ import annotations


def test_categories(client, seeded):
    assert seeded["categories"] == 6
    r = client.get("/api/v1/categories")
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 0
    cats = body["data"]
    assert len(cats) == 6
    sorts = [c["sort_order"] for c in cats]
    assert sorts == sorted(sorts)
    names = [c["name"] for c in cats]
    assert "荤菜" in names and "凉菜" in names


def test_dishes_pagination(client, seeded):
    r = client.get("/api/v1/dishes", params={"page": 1, "page_size": 5})
    d = r.json()["data"]
    assert d["total"] == 16
    assert d["page"] == 1
    assert d["page_size"] == 5
    assert len(d["items"]) == 5

    r2 = client.get("/api/v1/dishes", params={"page": 4, "page_size": 5})
    assert len(r2.json()["data"]["items"]) == 1  # 16 = 3*5 + 1

    r3 = client.get("/api/v1/dishes", params={"page": 5, "page_size": 5})
    assert r3.json()["data"]["items"] == []


def test_dishes_filter_by_category(client, seeded):
    r = client.get("/api/v1/categories")
    meat = next(c for c in r.json()["data"] if c["name"] == "荤菜")
    r2 = client.get("/api/v1/dishes", params={"category_id": meat["id"]})
    d = r2.json()["data"]
    assert d["total"] == 4
    assert all(it["category_id"] == meat["id"] for it in d["items"])


def test_dishes_search_by_keyword(client, seeded):
    r = client.get("/api/v1/dishes", params={"keyword": "红烧"})
    d = r.json()["data"]
    assert d["total"] >= 2  # 红烧肉 / 红烧茄子
    names = [it["name"] for it in d["items"]]
    assert "红烧肉" in names and "红烧茄子" in names


def test_dishes_search_matches_ingredients(client, seeded):
    r = client.get("/api/v1/dishes", params={"keyword": "五花肉"})
    d = r.json()["data"]
    assert d["total"] >= 1
    names = [it["name"] for it in d["items"]]
    assert "红烧肉" in names


def test_dish_detail(client, seeded):
    r = client.get("/api/v1/dishes", params={"keyword": "红烧肉"})
    dish_id = r.json()["data"]["items"][0]["id"]

    r2 = client.get(f"/api/v1/dishes/{dish_id}")
    assert r2.status_code == 200
    d = r2.json()["data"]
    assert d["name"] == "红烧肉"
    assert d["price"] == 28.0
    assert d["rating"] == 4.8
    assert d["ingredients"] == ["五花肉", "冰糖", "生抽", "老抽", "料酒"]
    assert d["cook_time"] == 60
    assert d["difficulty"] == "中等"


def test_dish_not_found(client, seeded):
    r = client.get("/api/v1/dishes/99999")
    assert r.status_code == 404
    assert r.json()["code"] == 40401