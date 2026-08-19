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