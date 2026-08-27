"""认证模块：游客 / 微信 / 用户名密码(H5) 登录 + 当前用户信息。

统一用户体系：users 是跨端账号，user_identities 承载渠道绑定。
游客绑定任一正式渠道（微信 / 用户名密码）即自动静默升级为正式账号。
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import create_access_token, get_current_user, get_optional_user
from app.models.user import Team, TeamMember, User
from app.schemas.auth import GuestLoginIn, ProfileUpdateIn, WebLoginIn, WebRegisterIn, WxLoginIn
from app.schemas.serializers import user_to_dict
from app.services import auth_service

router = APIRouter()


def _wx_code2session(code: str) -> str:
    """调用微信 jscode2session 换 openid；失败抛 50101。参数走 params 编码，避免拼接注入。"""
    settings = get_settings()
    try:
        with httpx.Client(timeout=5) as client:
            resp = client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={
                    "appid": settings.wx_appid,
                    "secret": settings.wx_secret,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ApiError(500, 50101, "微信服务暂不可用，请稍后再试") from exc
    openid = data.get("openid")
    if not openid:
        raise ApiError(500, 50101, f"微信登录失败：{data.get('errmsg', '未知错误')}")
    return openid


@router.post("/auth/guest")
def guest_login(body: GuestLoginIn, db: Session = Depends(get_db)) -> dict:
    """游客登录：同名游客复用；无昵称每次新建。"""
    user = auth_service.login_guest(db, body.nickname)
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


@router.post("/auth/wx-login")
def wx_login(
    body: WxLoginIn,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """微信登录：code 换 openid。

    若当前携带游客/已登录会话（Authorization），则把微信身份绑定到该账号，
    游客自动升级为正式账号（静默）。否则按 openid 自动注册。
    """
    settings = get_settings()
    if not settings.wx_appid or not settings.wx_secret:
        raise ApiError(400, 40001, "微信登录未配置，请使用游客登录")
    openid = _wx_code2session(body.code)
    user = auth_service.login_wechat(db, openid, current_user=current_user)
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


@router.post("/auth/register")
def web_register(
    body: WebRegisterIn,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """H5/Web 独立账号注册（用户名+密码）。

    未登录 → 自动注册新账号；已登录（游客或既有）→ 绑定到当前账号并（游客）静默升级。
    """
    user = auth_service.register_password(
        db, body.username.strip(), body.password,
        nickname=body.nickname, current_user=current_user,
    )
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


@router.post("/auth/login")
def web_login(body: WebLoginIn, db: Session = Depends(get_db)) -> dict:
    """H5/Web 用户名+密码登录。"""
    user = auth_service.login_password(db, body.username.strip(), body.password)
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """当前用户信息 + 团队列表（含角色/成员数/厨师昵称）。"""
    return _build_me_response(db, current_user)


@router.put("/me")
def update_me(
    body: ProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """修改个人信息（当前仅支持昵称）。"""
    nickname = (body.nickname or "").strip()
    if not nickname:
        raise ApiError(400, 40000, "昵称不能为空")
    if len(nickname) > 64:
        raise ApiError(400, 40000, "昵称最长 64 个字符")
    current_user.nickname = nickname
    db.commit()
    db.refresh(current_user)
    return _build_me_response(db, current_user)


def _build_me_response(db: Session, current_user: User) -> dict:
    """构建 /me 响应（GET 和 PUT 共用）。"""
    memberships = db.scalars(
        select(TeamMember)
        .where(TeamMember.user_id == current_user.id)
        .options(
            joinedload(TeamMember.team).joinedload(Team.chef),
            joinedload(TeamMember.team).selectinload(Team.members),
        )
    ).all()

    teams = []
    for m in memberships:
        team = m.team
        chef = team.chef
        teams.append(
            {
                "id": team.id,
                "name": team.name,
                "icon": "🏠",
                "invite_code": team.invite_code,
                "member_count": len(team.members),
                "role": m.role,
                "chef": chef.nickname if chef else None,
                "chef_nickname": chef.nickname if chef else None,
                "owner_id": team.owner_id,
            }
        )

    data = user_to_dict(current_user)
    data["teams"] = teams
    data["stats"] = _user_stats(db, current_user.id)
    # 契约：返回 {user:{...含 teams/stats}, teams:[...]} —— 前端统一以 res.user.teams 取团队
    return ok({"user": data, "teams": teams})


def _user_stats(db: Session, user_id: int) -> dict:
    """个人统计：总饭局 / 点过的菜（数量合计）/ 收藏菜品数。"""
    from sqlalchemy import func

    from app.models.activity import Activity, ActivityItem
    from app.models.favorite import Favorite

    total_activities = db.scalar(
        select(func.count(Activity.id)).where(Activity.created_by == user_id)
    ) or 0
    total_dishes = (
        db.scalar(
            select(func.coalesce(func.sum(ActivityItem.quantity), 0))
            .join(Activity, Activity.id == ActivityItem.activity_id)
            .where(ActivityItem.added_by == user_id)
        )
        or 0
    )
    favorite_dishes = db.scalar(
        select(func.count(Favorite.id)).where(Favorite.user_id == user_id)
    ) or 0
    return {
        "total_activities": int(total_activities),
        "total_dishes": int(total_dishes),
        "favorite_dishes": int(favorite_dishes),
    }