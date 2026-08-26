"""自建菜品 + 可见性：public/team/private 三态、列表/详情/随机/推荐/收藏/加菜过滤、编辑可见性、一键建菜谱。"""

from __future__ import annotations


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    return data["token"], data["user"]


def _create_team(client, token, name):
    r = client.post("/api/v1/teams", json={"name": name}, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _mk_dish(client, token, **over):
    cats = client.get("/api/v1/categories").json()["data"]
    cat_id = cats[0]["id"] if cats else 1
    payload = {"category_id": cat_id, "name": "测试菜", "visibility": "public", **over}
    r = client.post("/api/v1/dishes", json=payload, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _list(client, token=None, **params):
    q = {"page_size": 100, **params}
    r = client.get("/api/v1/dishes", params=q, headers=_auth(token) if token else None)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_dish_create_and_visibility(client, seeded):
    """创建 public/private 菜：创建者与游客视角差异。"""
    token_a, user_a = _login(client, "可见A")
    token_b, user_b = _login(client, "可见B")

    _mk_dish(client, token_a, name="公开菜")
    priv = _mk_dish(client, token_a, name="私有菜", visibility="private")

    # 创建者看到两菜
    names = {it["name"] for it in _list(client, token_a)["items"]}
    assert "公开菜" in names and "私有菜" in names

    # 游客只见公开
    names = {it["name"] for it in _list(client)["items"]}
    assert "公开菜" in names and "私有菜" not in names

    # 他人只见公开；私有菜详情 404
    names = {it["name"] for it in _list(client, token_b)["items"]}
    assert "公开菜" in names and "私有菜" not in names
    r = client.get(f"/api/v1/dishes/{priv['id']}", headers=_auth(token_b))
    assert r.status_code == 404
    # 创建者可见自己私有菜详情，且 visibility 正确
    r = client.get(f"/api/v1/dishes/{priv['id']}", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["data"]["visibility"] == "private"


def test_team_visibility_follows_membership(client, seeded):
    """团队菜：创建者所在团队所有成员可见；成员离开后不可见；他人不可见。"""
    token_a, user_a = _login(client, "队A")
    token_b, user_b = _login(client, "队B")
    token_c, user_c = _login(client, "队C")

    team = _create_team(client, token_a, "团队菜团队")
    invite = team["invite_code"]
    client.post("/api/v1/teams/join", json={"invite_code": invite}, headers=_auth(token_b))
    client.post("/api/v1/teams/join", json={"invite_code": invite}, headers=_auth(token_c))

    team_dish = _mk_dish(client, token_a, name="团队菜", visibility="team", team_id=team["id"])

    # A/B/C 均可见（同团队）
    for tok in (token_a, token_b, token_c):
        names = {it["name"] for it in _list(client, tok)["items"]}
        assert "团队菜" in names, f"{tok} 应看到团队菜"

    # C 离开团队 → 不可见团队菜
    client.post(f"/api/v1/teams/{team['id']}/leave", headers=_auth(token_c))
    names = {it["name"] for it in _list(client, token_c)["items"]}
    assert "团队菜" not in names
    r = client.get(f"/api/v1/dishes/{team_dish['id']}", headers=_auth(token_c))
    assert r.status_code == 404

    # 游客不见团队菜
    names = {it["name"] for it in _list(client)["items"]}
    assert "团队菜" not in names


def _cat_id(client) -> int:
    cats = client.get("/api/v1/categories").json()["data"]
    return cats[0]["id"] if cats else 1


def test_team_dish_requires_membership(client, seeded):
    """team 可见性创建/编辑：必须是自己所在团队。"""
    token_a, user_a = _login(client, "团A")
    token_b, user_b = _login(client, "团B")
    cat_id = _cat_id(client)

    team_b = _create_team(client, token_b, "B的团队")

    # A 发团队菜到 B 的团队 → 40002
    r = client.post(
        "/api/v1/dishes",
        json={"category_id": cat_id, "name": "越权菜", "visibility": "team", "team_id": team_b["id"]},
        headers=_auth(token_a),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40002

    # team 缺 team_id → 40000
    r = client.post(
        "/api/v1/dishes",
        json={"category_id": cat_id, "name": "缺团队菜", "visibility": "team"},
        headers=_auth(token_a),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40000


def test_edit_visibility(client, seeded):
    """自建菜可修改可见性（创建者）；平台/他人菜 403。"""
    token_a, user_a = _login(client, "改A")
    token_b, user_b = _login(client, "改B")

    mine = _mk_dish(client, token_a, name="可改菜")
    pub = _mk_dish(client, token_a, name="公开参照")

    # 改为 private：游客不可见
    r = client.put(
        f"/api/v1/dishes/{mine['id']}", json={"visibility": "private"}, headers=_auth(token_a)
    )
    assert r.status_code == 200
    assert r.json()["data"]["visibility"] == "private"

    # 他人不能改为自己编辑
    r = client.put(f"/api/v1/dishes/{mine['id']}", json={"name": "篡改"}, headers=_auth(token_b))
    assert r.status_code == 403

    # 平台菜（seeded）不可编辑（created_by 为 NULL）
    seed_dish = client.get("/api/v1/dishes?page_size=1").json()["data"]["items"][0]
    r = client.put(f"/api/v1/dishes/{seed_dish['id']}", json={"name": "改平台"}, headers=_auth(token_a))
    assert r.status_code == 403


def test_dish_with_recipe_creates_linked_recipe(client, seeded):
    """POST /dishes 带 recipe → 一键创建关联菜谱（dish_id/category_id 绑定）。"""
    token_a, user_a = _login(client, "一菜一谱")
    cat_id = _cat_id(client)

    r = client.post(
        "/api/v1/dishes",
        json={
            "category_id": cat_id,
            "name": "一键菜",
            "visibility": "public",
            "recipe": {"name": "一键菜做法", "steps": ["洗菜", "炒熟"], "is_public": True},
        },
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["recipe_id"] is not None

    # 对应菜谱存在且绑定 dish_id + category_id
    r = client.get(f"/api/v1/recipes/{data['recipe_id']}")
    assert r.status_code == 200
    recipe = r.json()["data"]
    assert recipe["dish_id"] == data["id"]
    assert recipe["category_id"] == data["category_id"]
    assert recipe["steps"] == ["洗菜", "炒熟"]


def test_recipe_category_filter(client, seeded):
    """菜谱库按分类筛选：公开菜谱按关联菜品带分类；category_id 筛选生效。"""
    token_a, user_a = _login(client, "谱类A")

    # 自建菜谱带分类（create 时指定 category_id）
    cat_id = _cat_id(client)
    r = client.post(
        "/api/v1/recipes",
        json={"name": "分类菜谱", "steps": ["做"], "category_id": cat_id},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]

    # 我的菜谱按分类筛到它
    r = client.get(f"/api/v1/recipes?owner=me&category_id={cat_id}", headers=_auth(token_a))
    assert r.status_code == 200
    ids = {it["id"] for it in r.json()["data"]["items"]}
    assert rid in ids


def test_dish_filtered_out_of_random_and_favorite(client, seeded):
    """不可见菜不进随机/推荐；不可见菜不可收藏；收藏列表过滤。"""
    token_a, user_a = _login(client, "滤A")
    token_b, user_b = _login(client, "滤B")

    priv = _mk_dish(client, token_a, name="过滤私有", visibility="private")

    # B 不可见：随机/推荐池没有
    r = client.get("/api/v1/dishes/random?n=100", headers=_auth(token_b))
    assert priv["id"] not in {d["id"] for d in r.json()["data"]}
    # 游客随机池也没有
    r = client.get("/api/v1/dishes/random?n=100")
    assert priv["id"] not in {d["id"] for d in r.json()["data"]}

    # B 收藏私有菜 → 404
    r = client.post(f"/api/v1/dishes/{priv['id']}/favorite", headers=_auth(token_b))
    assert r.status_code == 404
    # A 可收藏并在收藏列表见
    r = client.post(f"/api/v1/dishes/{priv['id']}/favorite", headers=_auth(token_a))
    assert r.status_code == 200
    r = client.get("/api/v1/favorites", headers=_auth(token_a))
    assert priv["id"] in {it["id"] for it in r.json()["data"]["items"]}


def test_activity_add_item_visibility(client, seeded):
    """点菜：不可见菜不能加入活动。"""
    token_a, user_a = _login(client, "点A")
    token_b, user_b = _login(client, "点B")

    team = _create_team(client, token_a, "可见点菜")
    client.post("/api/v1/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(token_b))
    r = client.post(
        "/api/v1/activities",
        json={"team_id": team["id"], "type": "party", "name": "可见饭局"},
        headers=_auth(token_a),
    )
    act_id = r.json()["data"]["id"]

    priv = _mk_dish(client, token_a, name="点菜私有", visibility="private")

    # B 加私有菜 → 404
    r = client.post(
        f"/api/v1/activities/{act_id}/items", json={"dish_id": priv["id"], "quantity": 1}, headers=_auth(token_b)
    )
    assert r.status_code == 404
    # A 加自己私有菜 → 成功
    r = client.post(
        f"/api/v1/activities/{act_id}/items", json={"dish_id": priv["id"], "quantity": 1}, headers=_auth(token_a)
    )
    assert r.status_code == 200, r.text


def test_dish_list_mine(client, seeded):
    """mine=1 只看自己创建的菜。"""
    token_a, user_a = _login(client, "我A")
    token_b, user_b = _login(client, "我B")

    _mk_dish(client, token_a, name="我的菜一")
    _mk_dish(client, token_b, name="他的菜")

    r = _list(client, token_a, mine=1)
    names = {it["name"] for it in r["items"]}
    assert "我的菜一" in names and "他的菜" not in names