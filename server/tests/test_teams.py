"""团队模块测试（M2 补充）：创建 / 加入 / 详情 / 权限 / 指定厨师。"""

from __future__ import annotations

from fastapi.testclient import TestClient

PREFIX = "/api/v1"


def _guest(client: TestClient, nickname: str) -> dict:
    r = client.post(f"{PREFIX}/auth/guest", json={"nickname": nickname})
    assert r.status_code == 200
    data = r.json()["data"]
    return {"token": data["token"], "id": data["user"]["id"], "nickname": nickname}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_create_team_and_me(client: TestClient) -> None:
    g = _guest(client, "团长")
    r = client.post(f"{PREFIX}/teams", json={"name": "测试团"}, headers=_auth(g["token"]))
    assert r.status_code == 200
    team = r.json()["data"]
    assert team["name"] == "测试团"
    assert team["role"] == "organizer"
    assert team["member_count"] == 1
    assert len(team["invite_code"]) == 8

    me = client.get(f"{PREFIX}/me", headers=_auth(g["token"])).json()["data"]
    # 契约：{ user: {...含 teams}, teams: [...] } —— 小程序端统一取 res.user
    assert me["user"]["id"] == g["id"]
    entry = [t for t in me["user"]["teams"] if t["id"] == team["id"]]
    assert entry, "团队应出现在 /me 的 user.teams 中"
    assert entry[0]["role"] == "organizer"
    assert entry[0]["chef"] is None


def test_join_team_by_invite_code(client: TestClient) -> None:
    owner = _guest(client, "团主")
    member = _guest(client, "团员")
    team = client.post(f"{PREFIX}/teams", json={"name": "邀请团"}, headers=_auth(owner["token"])).json()["data"]

    r = client.post(
        f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(member["token"])
    )
    assert r.status_code == 200
    joined = r.json()["data"]
    assert joined["id"] == team["id"]
    assert joined["role"] == "member"
    assert joined["member_count"] == 2

    # 重复加入 → 40005
    r = client.post(
        f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(member["token"])
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40005

    # 无效邀请码 → 40403
    r = client.post(f"{PREFIX}/teams/join", json={"invite_code": "ZZZZZZZZ"}, headers=_auth(member["token"]))
    assert r.status_code == 404
    assert r.json()["code"] == 40403


def test_team_detail_and_permission(client: TestClient) -> None:
    owner = _guest(client, "团主2")
    outsider = _guest(client, "外人")
    team = client.post(f"{PREFIX}/teams", json={"name": "私密团"}, headers=_auth(owner["token"])).json()["data"]

    # 非成员 → 40301
    r = client.get(f"{PREFIX}/teams/{team['id']}", headers=_auth(outsider["token"]))
    assert r.status_code == 403
    assert r.json()["code"] == 40301

    detail = client.get(f"{PREFIX}/teams/{team['id']}", headers=_auth(owner["token"])).json()["data"]
    assert detail["team"]["name"] == "私密团"
    assert detail["team"]["member_count"] == 1
    assert detail["members"][0]["role"] == "organizer"
    assert detail["members"][0]["nickname"] == "团主2"


def test_set_chef_permissions_and_flow(client: TestClient) -> None:
    owner = _guest(client, "组织者")
    member = _guest(client, "厨子")
    outsider = _guest(client, "路人")
    team = client.post(f"{PREFIX}/teams", json={"name": "厨师测试团"}, headers=_auth(owner["token"])).json()["data"]
    client.post(f"{PREFIX}/teams/join", json={"invite_code": team["invite_code"]}, headers=_auth(member["token"]))

    # 非组织者 → 40302
    r = client.put(
        f"{PREFIX}/teams/{team['id']}/chef", json={"user_id": member["id"]}, headers=_auth(member["token"])
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40302

    # 目标非成员 → 40002
    r = client.put(
        f"{PREFIX}/teams/{team['id']}/chef", json={"user_id": outsider["id"]}, headers=_auth(owner["token"])
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40002

    # 正常指定固定厨师
    r = client.put(
        f"{PREFIX}/teams/{team['id']}/chef", json={"user_id": member["id"]}, headers=_auth(owner["token"])
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["chef_id"] == member["id"]
    assert data["chef"] == "厨子"