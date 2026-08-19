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


# ===== 五期：随机点菜加强 =====


def _cat_id_by_name(client, name: str) -> int:
    cats = client.get("/api/v1/categories").json()["data"]
    return next(c["id"] for c in cats if c["name"] == name)


def _dish_ids_by_category(client, cat_id: int) -> list[int]:
    d = client.get("/api/v1/dishes", params={"category_id": cat_id, "page_size": 100}).json()["data"]
    return [it["id"] for it in d["items"]]


def test_random_balanced(client, seeded):
    """均衡：随机 3 道应至少覆盖荤 / 素 / 汤 中的不同类（组合合理）。"""
    r = client.get("/api/v1/dishes/random", params={"n": 3, "type": "balanced"})
    assert r.status_code == 200
    items = r.json()["data"]
    assert len(items) == 3
    assert all(it["is_active"] for it in items)

    # 荤/素/汤 类别 id 集合
    meat_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "荤菜")))
    veg_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "蔬菜也要吃呀")))
    soup_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "饭后最后一口汤")))
    have_meat = any(it["id"] in meat_ids for it in items)
    have_veg = any(it["id"] in veg_ids for it in items)
    have_soup = any(it["id"] in soup_ids for it in items)
    # 至少出现荤或素（组合有营养）；n=3 时荤素汤应大体齐全
    assert have_meat or have_veg or have_soup
    if len(items) == 3:
        assert have_meat and have_veg and have_soup


def test_random_surprise(client, seeded):
    """惊喜：返回 n 道不重复菜品（全库洗牌）。"""
    r = client.get("/api/v1/dishes/random", params={"n": 5, "type": "surprise"})
    items = r.json()["data"]
    assert len(items) == 5
    ids = [it["id"] for it in items]
    assert len(set(ids)) == 5


def test_random_nutrition(client, seeded):
    """营养：按类型打分，优先命中营养均衡组合。"""
    r = client.get("/api/v1/dishes/random", params={"n": 3, "type": "nutrition"})
    items = r.json()["data"]
    assert len(items) == 3

    meat_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "荤菜")))
    veg_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "蔬菜也要吃呀")))
    energy_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "美味能量补给")))
    roles = set()
    for it in items:
        if it["id"] in meat_ids:
            roles.add("meat")
        elif it["id"] in veg_ids:
            roles.add("veg")
        elif it["id"] in energy_ids:
            roles.add("energy")
    # 核心均衡组合（荤/素/能量各一个）命中的概率很高
    assert roles & {"meat", "veg", "energy"}


def test_random_n_exceed_pool(client, seeded):
    """n 大于菜品总数时返回全部在售菜品。"""
    r = client.get("/api/v1/dishes/random", params={"n": 100, "type": "surprise"})
    items = r.json()["data"]
    total = client.get("/api/v1/dishes", params={"page_size": 100}).json()["data"]["total"]
    assert len(items) == total


def test_recommend_by_people(client, seeded):
    """按人数推荐一轮饭：3 人 → 2 荤 2 素 1 汤 1 主食。"""
    r = client.get("/api/v1/dishes/recommend", params={"people": 3})
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["reason"] == "按 3 人：2 荤 2 素 1 汤 1 主食"
    plan = d["plan"]
    assert len(plan) == 6  # 2肉 + 2素 + 1汤 + 1主食

    meat_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "荤菜")))
    veg_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "蔬菜也要吃呀")))
    soup_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "饭后最后一口汤")))
    staple_ids = set(_dish_ids_by_category(client, _cat_id_by_name(client, "主食")))
    assert sum(1 for it in plan if it["id"] in meat_ids) == 2
    assert sum(1 for it in plan if it["id"] in veg_ids) == 2
    assert sum(1 for it in plan if it["id"] in soup_ids) == 1
    assert sum(1 for it in plan if it["id"] in staple_ids) == 1


def test_recommend_people_one(client, seeded):
    """1 人 → 1 荤 1 素 1 汤 1 主食。"""
    r = client.get("/api/v1/dishes/recommend", params={"people": 1})
    d = r.json()["data"]
    assert d["reason"] == "按 1 人：1 荤 1 素 1 汤 1 主食"
    assert len(d["plan"]) == 4
