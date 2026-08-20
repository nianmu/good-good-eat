"""认证模块测试（M2.2）：游客登录 / /me / 鉴权失败 / 微信未配置。"""

from __future__ import annotations

import re


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_guest_login_and_me(client):
    r = client.post("/api/v1/auth/guest", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 0
    data = body["data"]
    assert data["token"]
    user = data["user"]
    assert user["is_guest"] is True
    assert user["avatar"] == "👤"
    assert re.fullmatch(r"\d{8}", user["user_code"])
    assert user["nickname"].startswith("用户")

    r = client.get("/api/v1/me", headers=_auth(data["token"]))
    assert r.status_code == 200
    me = r.json()["data"]
    assert me["user"]["id"] == user["id"]
    assert me["user"]["teams"] == []
    assert me["teams"] == []


def test_web_register_and_login(client):
    """H5 独立账号：注册 → 登录 → 密码错误 / 重复注册。"""
    r = client.post("/api/v1/auth/register", json={"username": "chef_tom", "password": "secret123", "nickname": "小厨"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["token"]
    user = data["user"]
    assert user["is_guest"] is False
    assert user["nickname"] == "小厨"

    # 登录成功 → 同账号
    r = client.post("/api/v1/auth/login", json={"username": "chef_tom", "password": "secret123"})
    assert r.status_code == 200
    assert r.json()["data"]["user"]["id"] == user["id"]

    # 密码错误（统一报错防枚举）
    r = client.post("/api/v1/auth/login", json={"username": "chef_tom", "password": "wrong-pass!"})
    assert r.status_code == 400
    assert r.json()["code"] == 40021

    # 用户名已注册
    r = client.post("/api/v1/auth/register", json={"username": "chef_tom", "password": "another-pass"})
    assert r.status_code == 400
    assert r.json()["code"] == 40020


def test_guest_register_upgrades_silently(client):
    """游客注册 H5 账号：自动绑定并静默升级（保留原账号 id / 团队 / 订单数据）。"""
    # 先游客入场（拿到游客 token）
    guest = client.post("/api/v1/auth/guest", json={"nickname": "路人甲"})
    guest_data = guest.json()["data"]
    guest_id = guest_data["user"]["id"]
    assert guest_data["user"]["is_guest"] is True

    # 携带游客会话去注册 → 账号升级，id 不变
    gtoken = guest_data["token"]
    reg = client.post(
        "/api/v1/auth/register",
        json={"username": "h5_user", "password": "secret123"},
        headers=_auth(gtoken),
    )
    assert reg.status_code == 200
    up = reg.json()["data"]["user"]
    assert up["id"] == guest_id
    assert up["is_guest"] is False

    # 升级后用密码登录 → 仍是同一账号
    login = client.post("/api/v1/auth/login", json={"username": "h5_user", "password": "secret123"})
    assert login.json()["data"]["user"]["id"] == guest_id


def test_register_conflict_rejects_wrong_bind(client):
    """同用户名已在他人名下时，游客不能再把它绑到自己（40006 经由服务层保障）。"""
    # 一人注册 chef_x
    a = client.post("/api/v1/auth/register", json={"username": "chef_x", "password": "secret123"})
    assert a.status_code == 200

    # 另一游客想注册同名 → 用户名被占
    guest = client.post("/api/v1/auth/guest", json={"nickname": "路人乙"})
    gtoken = guest.json()["data"]["token"]
    r = client.post(
        "/api/v1/auth/register",
        json={"username": "chef_x", "password": "abc-123456"},
        headers=_auth(gtoken),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40020


def test_wechat_identity_service_flow(db_session):
    """微信身份服务层：自动注册绑定 / 游客静默升级 / 身份占用拒绝。"""
    from app.core.exceptions import ApiError
    from app.services import auth_service as s

    # 1) 自动注册：openid 未绑定 → 新建正式用户
    u = s.login_wechat(db_session, "openid-1001", nickname="微信用户")
    assert u.id and u.is_guest is False

    # 2) 同一 openid 再次登录 → 返回同一用户（不重复注册）
    u2 = s.login_wechat(db_session, "openid-1001")
    assert u2.id == u.id

    # 3) 游客静默升级
    g = s.login_guest(db_session, "组合人")
    assert g.is_guest is True
    up = s.login_wechat(db_session, "openid-1002", current_user=g)
    assert up.id == g.id and up.is_guest is False

    # 4) 身份被他人占用：游客想绑已绑定的 openid 应被拒
    guest2 = s.login_guest(db_session, "占位人")
    try:
        s.login_wechat(db_session, "openid-1002", current_user=guest2)
        assert False, "should reject binding claimed openid"
    except ApiError as e:
        assert e.code == 40006


def test_me_without_token_returns_40101(client):
    r = client.get("/api/v1/me")
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == 40101
    assert body["data"] is None


def test_me_with_bad_token_returns_40101(client):
    r = client.get("/api/v1/me", headers=_auth("not-a-jwt"))
    assert r.status_code == 401
    assert r.json()["code"] == 40101


def test_guest_login_with_nickname_and_reuse(client):
    r = client.post("/api/v1/auth/guest", json={"nickname": "干饭人"})
    user1 = r.json()["data"]["user"]
    assert user1["nickname"] == "干饭人"

    r2 = client.post("/api/v1/auth/guest", json={"nickname": "干饭人"})
    user2 = r2.json()["data"]["user"]
    assert user2["id"] == user1["id"]  # 同名游客复用


def test_wx_login_not_configured(client):
    r = client.post("/api/v1/auth/wx-login", json={"code": "test-code"})
    assert r.status_code == 400
    assert r.json()["code"] == 40001


def test_me_teams(client, db_session, seeded):
    token, user = _login(client, "组长")
    team = _create_team(db_session, user["id"], name="我家")
    token2, user2 = _login(client, "成员小乙")
    _add_member(db_session, team.id, user2["id"])

    r = client.get("/api/v1/me", headers=_auth(token))
    teams = r.json()["data"]["teams"]
    assert len(teams) == 1
    t = teams[0]
    assert t["id"] == team.id
    assert t["name"] == "我家"
    assert t["role"] == "organizer"
    assert t["member_count"] == 2
    assert t["chef_nickname"] is None


def _login(client, nickname=None):
    payload = {"nickname": nickname} if nickname else {}
    r = client.post("/api/v1/auth/guest", json=payload)
    data = r.json()["data"]
    return data["token"], data["user"]


def _create_team(db, owner_id, name="测试团队"):
    import secrets

    from app.models.user import Team, TeamMember

    team = Team(
        name=name,
        invite_code="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8)),
        owner_id=owner_id,
    )
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=owner_id, role="organizer"))
    db.commit()
    db.refresh(team)
    return team


def _add_member(db, team_id, user_id, role="member"):
    from app.models.user import TeamMember

    db.add(TeamMember(team_id=team_id, user_id=user_id, role=role))
    db.commit()