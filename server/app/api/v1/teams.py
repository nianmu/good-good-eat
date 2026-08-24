"""团队模块：创建 / 加入 / 详情 / 指定固定厨师。

契约对齐小程序端 mock（miniprogram/utils/mock.js）：
- POST /teams        → {id,name,icon,invite_code,member_count,role,chef,chef_id,owner_id}
- POST /teams/join   → 同上
- GET  /teams/{id}   → {team:{...同上}, members:[{id,nickname,avatar,role}]}
- PUT  /teams/{id}/chef {user_id} → {id, chef, chef_id}
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.user import Team, TeamMember, User
from app.schemas.teams import TeamCreateIn, TeamJoinIn, TeamSetChefIn

router = APIRouter()

# 邀请码字符集：去掉易混淆的 0/O/1/I
_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _unique_invite_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(8))
        if db.scalar(select(Team.id).where(Team.invite_code == code)) is None:
            return code
    raise ApiError(500, 50000, "邀请码生成失败，请重试")


def _load_team(db: Session, team_id: int) -> Team:
    """加载团队（chef/members/member.user 预加载）；不存在 40401。
    populate_existing：覆盖会话身份映射中已缓存的过期集合（commit 后成员变更需重新读取）。
    """
    team = db.scalar(
        select(Team)
        .where(Team.id == team_id)
        .options(
            joinedload(Team.chef),
            joinedload(Team.members).joinedload(TeamMember.user),
        )
        .execution_options(populate_existing=True)
    )
    if team is None:
        raise ApiError(404, 40401, "团队不存在")
    return team


def _member_role(db: Session, team_id: int, user_id: int) -> str | None:
    return db.scalar(
        select(TeamMember.role).where(
            TeamMember.team_id == team_id, TeamMember.user_id == user_id
        )
    )


def _team_payload(db: Session, team: Team, actor: User) -> dict:
    """当前用户视角的团队载荷（对齐 mock 契约）。"""
    role = _member_role(db, team.id, actor.id) or "member"
    chef = team.chef
    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "icon": "🏠",
        "invite_code": team.invite_code,
        "member_count": len(team.members),
        "role": role,
        "chef": chef.nickname if chef else None,
        "chef_id": chef.id if chef else None,
        "owner_id": team.owner_id,
    }


@router.post("/teams")
def create_team(
    body: TeamCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建团队：创建者为组织者，自动入团，生成邀请码。"""
    name = body.name.strip()
    if not name:
        raise ApiError(400, 40000, "团队名称不能为空")

    team = Team(
        name=name, description=body.description, owner_id=user.id, invite_code=_unique_invite_code(db)
    )
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=user.id, role="organizer"))
    db.commit()
    db.refresh(team)
    return ok(_team_payload(db, team, user))


@router.post("/teams/join")
def join_team(
    body: TeamJoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """凭邀请码加入团队；已在团内 40005。"""
    code = body.invite_code.strip().upper()
    if not code:
        raise ApiError(400, 40000, "请输入邀请码")

    team = db.scalar(
        select(Team)
        .where(Team.invite_code == code)
        .options(joinedload(Team.chef), joinedload(Team.members))
    )
    if team is None:
        raise ApiError(404, 40403, "邀请码无效，请核对后重试")

    if _member_role(db, team.id, user.id) is not None:
        raise ApiError(400, 40005, "你已在团队中，无需重复加入")

    db.add(TeamMember(team_id=team.id, user_id=user.id, role="member"))
    db.commit()
    # 刷新预加载数据以反映新成员
    team = _load_team(db, team.id)
    return ok(_team_payload(db, team, user))


@router.get("/teams/{team_id}")
def team_detail(
    team_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """团队详情：仅成员可见（40301）；含成员列表。"""
    if _member_role(db, team_id, user.id) is None:
        raise ApiError(403, 40301, "无权查看该团队")
    team = _load_team(db, team_id)

    members = []
    for m in team.members:
        members.append(
            {
                "id": m.user_id,
                "nickname": m.user.nickname if m.user else f"用户{m.user_id}",
                "avatar": m.user.avatar if m.user else "👤",
                "role": m.role,
            }
        )

    return ok({"team": _team_payload(db, team, user), "members": members})


@router.post("/teams/{team_id}/leave")
def leave_team(
    team_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """成员自退；组织者自退且团队还有其他人时 400 提示先转让；最后一人自退解散团队。"""
    team = db.scalar(select(Team).where(Team.id == team_id))
    if team is None:
        raise ApiError(404, 40401, "团队不存在")

    role = _member_role(db, team_id, user.id)
    if role is None:
        raise ApiError(403, 40301, "无权查看该团队")

    # 组织者自退
    if role == "organizer":
        other_count = db.scalar(
            select(TeamMember.id).where(
                TeamMember.team_id == team_id, TeamMember.user_id != user.id
            )
        )
        if other_count is not None:
            raise ApiError(400, 40006, "请先转让组织者")

        # 最后一人（组织者独留）— 解散团队
        # 先清固定厨师引用避免外键约束（若 chef_id 指向自己）
        # 团队的 members 通过 cascade 删除，团队本身删除
        db.delete(team)
        db.commit()
        return ok({"team_id": team_id})

    # 普通成员自退
    membership = db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    )
    if membership is not None:
        db.delete(membership)
    # 若退出的成员是固定厨师，清空
    if team.chef_id == user.id:
        team.chef_id = None
    db.commit()
    return ok({"team_id": team_id})


@router.delete("/teams/{team_id}/members/{user_id}")
def remove_member(
    team_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """组织者移除成员；校验请求者为 organizer、目标为成员且非组织者本人。"""
    # 校验请求者为组织者
    if _member_role(db, team_id, user.id) != "organizer":
        raise ApiError(403, 40302, "仅组织者可移除成员")

    team = db.scalar(select(Team).where(Team.id == team_id))
    if team is None:
        raise ApiError(404, 40401, "团队不存在")

    target_role = _member_role(db, team_id, user_id)
    if target_role is None:
        raise ApiError(400, 40002, "该成员不在团队中")

    if target_role == "organizer":
        raise ApiError(400, 40007, "不能移除组织者")

    if user_id == user.id:
        raise ApiError(400, 40000, "不能移除自己，请使用退出接口")

    membership = db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if membership is not None:
        db.delete(membership)
    if team.chef_id == user_id:
        team.chef_id = None
    db.commit()
    return ok({"team_id": team_id})


@router.put("/teams/{team_id}/chef")
def set_team_chef(
    team_id: int,
    body: TeamSetChefIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """指定固定厨师：仅组织者可操作；目标必须是团队内成员，传空则取消固定厨师。"""
    if _member_role(db, team_id, user.id) != "organizer":
        raise ApiError(403, 40302, "仅组织者可指定厨师")

    team = db.scalar(
        select(Team).where(Team.id == team_id).options(joinedload(Team.chef), joinedload(Team.members))
    )
    if team is None:
        raise ApiError(404, 40401, "团队不存在")

    # 取消固定厨师：user_id 为空
    if body.user_id is None:
        team.chef_id = None
        db.commit()
        db.refresh(team)
        return ok({"id": team.id, "chef": None, "chef_id": None})

    if _member_role(db, team_id, body.user_id) is None:
        raise ApiError(400, 40002, "该成员不在团队中")

    team.chef_id = body.user_id
    db.commit()
    db.refresh(team)
    chef = team.chef
    return ok(
        {
            "id": team.id,
            "chef": chef.nickname if chef else None,
            "chef_id": chef.id if chef else None,
        }
    )


@router.get("/teams/{team_id}/cart")
def team_cart_snapshot(
    team_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """团队协作购物车快照（三期 WS 购物车的 REST 读兜底）：仅团队内成员可见。

    购物车为单进程内存态（WS 房间维持），此处返回当前房间快照，
    供未接入 WebSocket 的客户端（如 H5 初始加载）同步同行点菜情况。
    """
    if _member_role(db, team_id, user.id) is None:
        raise ApiError(403, 40301, "无权查看该团队")
    # 延迟导入，避免 teams ↔ ws.handlers 互导
    from app.ws.handlers import manager

    return ok(manager.cart_snapshot(team_id))