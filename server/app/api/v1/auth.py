"""认证模块（M2.2）：游客登录 / 微信登录 / 当前用户信息。"""

from __future__ import annotations

import json
import secrets
import urllib.request

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import create_access_token, get_current_user
from app.models.user import Team, TeamMember, User
from app.schemas.auth import GuestLoginIn, WxLoginIn
from app.schemas.serializers import user_to_dict

router = APIRouter()


def _random_digits(n: int = 8) -> str:
    """生成 n 位随机数字字符串（允许前导零）。"""
    return f"{secrets.randbelow(10 ** n):0{n}d}"


def _unique_user_code(db: Session) -> str:
    """生成不与现有用户冲突的 8 位数字标识码。"""
    for _ in range(10):
        code = _random_digits(8)
        if db.scalar(select(User.id).where(User.user_code == code)) is None:
            return code
    raise ApiError(500, 50000, "用户标识码生成失败，请重试")


@router.post("/auth/guest")
def guest_login(body: GuestLoginIn, db: Session = Depends(get_db)) -> dict:
    """游客登录：建/取 is_guest=True 用户，返回 {token, user}。"""
    nickname = (body.nickname or "").strip()
    if nickname:
        existing = db.scalar(
            select(User).where(User.nickname == nickname, User.is_guest.is_(True)).limit(1)
        )
        if existing is not None:
            return ok({"token": create_access_token(existing.id), "user": user_to_dict(existing)})
    else:
        nickname = f"用户{_random_digits()}"

    user = User(
        nickname=nickname,
        avatar="👤",
        user_code=_unique_user_code(db),
        is_guest=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


def _wx_code2session(code: str) -> str:
    """调用微信 jscode2session 换 openid；失败抛 50101。"""
    settings = get_settings()
    url = (
        "https://api.weixin.qq.com/sns/jscode2session"
        f"?appid={settings.wx_appid}&secret={settings.wx_secret}"
        f"&js_code={code}&grant_type=authorization_code"
    )
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise ApiError(500, 50101, "微信服务暂不可用，请稍后再试") from exc
    openid = data.get("openid")
    if not openid:
        raise ApiError(500, 50101, f"微信登录失败：{data.get('errmsg', '未知错误')}")
    return openid


@router.post("/auth/wx-login")
def wx_login(body: WxLoginIn, db: Session = Depends(get_db)) -> dict:
    """微信登录：code 换 openid，openid 找/建用户后签发 token。"""
    settings = get_settings()
    if not settings.wx_appid or not settings.wx_secret:
        raise ApiError(400, 40001, "微信登录未配置，请使用游客登录")

    openid = _wx_code2session(body.code)
    user = db.scalar(select(User).where(User.openid == openid).limit(1))
    if user is None:
        user = User(
            openid=openid,
            nickname=f"用户{_random_digits()}",
            avatar="👤",
            user_code=_unique_user_code(db),
            is_guest=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return ok({"token": create_access_token(user.id), "user": user_to_dict(user)})


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """当前用户信息 + 团队列表（含角色/成员数/厨师昵称）。"""
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
    # 契约：返回 {user:{...含 teams/stats}, teams:[...]} —— 小程序端统一以 res.user.teams 取团队
    return ok({"user": data, "teams": teams})


def _user_stats(db: Session, user_id: int) -> dict:
    """个人统计：总订单 / 点过的菜（数量合计）/ 收藏菜品数。"""
    from sqlalchemy import func, select as _select

    from app.models.favorite import Favorite
    from app.models.order import Order, OrderItem

    total_orders = db.scalar(
        _select(func.count(Order.id)).where(Order.user_id == user_id)
    ) or 0
    total_dishes = (
        db.scalar(
            _select(func.coalesce(func.sum(OrderItem.quantity), 0)).join(
                Order, Order.id == OrderItem.order_id
            ).where(Order.user_id == user_id)
        )
        or 0
    )
    favorite_dishes = db.scalar(
        _select(func.count(Favorite.id)).where(Favorite.user_id == user_id)
    ) or 0
    return {
        "total_orders": int(total_orders),
        "total_dishes": int(total_dishes),
        "favorite_dishes": int(favorite_dishes),
    }