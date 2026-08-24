"""活动模块：创建 / 列表 / 详情 / 状态流转。

契约（Spec 第 4 节）：
- POST /activities {team_id*, type:daily|party, name, people?, remark?}
- GET /activities?team_id&status&page
- GET /activities/{id}
- POST /activities/{id}/status {target}  单向 ordering→preparing→cooking→completed，with_for_update 行锁
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.activity import Activity, ActivityItem
from app.models.dish import Dish
from app.models.fridge import FridgeItem
from app.models.user import Team, TeamMember, User
from app.schemas.activities import ActivityCreateIn, ActivityStatusIn

router = APIRouter(prefix="/activities", tags=["activities"])

_ALLOWED_TYPES = {"daily", "party"}
_STATUS_FLOW: dict[str, set[str]] = {
    "ordering": {"preparing"},
    "preparing": {"cooking"},
    "cooking": {"completed"},
    "completed": set(),
}
_ALL_STATUSES = set(_STATUS_FLOW) | {s for vals in _STATUS_FLOW.values() for s in vals}
_PROGRESS_PERCENT = {"ordering": 0, "preparing": 33, "cooking": 66, "completed": 100}


def _ensure_member(db: Session, team_id: int, user_id: int) -> None:
    member = db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    if member is None:
        raise ApiError(403, 40301, "无权访问该团队")


def _activity_to_dict(a: Activity) -> dict:
    return {
        "id": a.id,
        "team_id": a.team_id,
        "type": a.type,
        "name": a.name,
        "status": a.status,
        "people": a.people,
        "remark": a.remark,
        "created_by": a.created_by,
        "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S") if a.created_at else None,
        "updated_at": a.updated_at.strftime("%Y-%m-%d %H:%M:%S") if a.updated_at else None,
    }


def _ingredients_for_activity(db: Session, activity: Activity, current_user: User) -> list[dict]:
    """聚合 activity_items -> dishes.ingredients -> 去重，daily 时按当前用户 fridge 判定 has。"""
    items = db.scalars(select(ActivityItem).where(ActivityItem.activity_id == activity.id)).all()
    if not items:
        return []
    dish_ids = list({it.dish_id for it in items})
    dishes = db.scalars(select(Dish).where(Dish.id.in_(dish_ids))).all()
    # 去重食材名
    names: list[str] = []
    seen: set[str] = set()
    for d in dishes:
        raw = d.ingredients or "[]"
        try:
            arr = json.loads(raw)
        except Exception:
            arr = []
        if not isinstance(arr, list):
            continue
        for n in arr:
            if not isinstance(n, str):
                continue
            n = n.strip()
            if not n or n in seen:
                continue
            seen.add(n)
            names.append(n)
    if not names:
        return []
    # daily: has 取决于当前用户 fridge；party: 全 true；若无 fridge 表兼容恒 true
    if activity.type == "party":
        return [{"name": n, "has": True} for n in names]
    # daily
    try:
        owned = {
            row[0]
            for row in db.execute(
                select(FridgeItem.name).where(FridgeItem.user_id == current_user.id)
            ).all()
        }
    except Exception:
        owned = set(names)  # 兼容无 fridge 表
    return [{"name": n, "has": n in owned} for n in names]


@router.post("")
def create_activity(
    body: ActivityCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建活动：必选团队且为成员，type 校验，name 非空。"""
    name = body.name.strip()
    if not name:
        raise ApiError(400, 40000, "活动名称不能为空")
    if body.type not in _ALLOWED_TYPES:
        raise ApiError(400, 40000, "活动类型仅支持 daily|party")
    team = db.get(Team, body.team_id)
    if team is None:
        raise ApiError(404, 40401, "团队不存在")
    _ensure_member(db, body.team_id, user.id)

    activity = Activity(
        team_id=body.team_id,
        type=body.type,
        name=name,
        status="ordering",
        people=body.people,
        remark=body.remark,
        created_by=user.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return ok(_activity_to_dict(activity))


@router.get("")
def list_activities(
    team_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """分页列表：team_id 可选过滤，status 可选过滤。非成员不可见对应团队活动。"""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds: list = []
    if team_id is not None:
        _ensure_member(db, team_id, user.id)
        conds.append(Activity.team_id == team_id)
    else:
        # 仅返回当前用户所在团队的活动
        team_ids = db.scalars(select(TeamMember.team_id).where(TeamMember.user_id == user.id)).all()
        if not team_ids:
            return ok({"total": 0, "page": page, "page_size": page_size, "items": []})
        conds.append(Activity.team_id.in_(team_ids))

    if status is not None:
        if status not in _ALL_STATUSES:
            raise ApiError(400, 40000, f"未知状态：{status}")
        conds.append(Activity.status == status)

    total = db.scalar(select(func.count(Activity.id)).where(*conds)) or 0
    activities = db.scalars(
        select(Activity)
        .where(*conds)
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [_activity_to_dict(a) for a in activities],
        }
    )


@router.get("/{activity_id}")
def get_activity(
    activity_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """详情：含 members, items[], ingredients[{name,has}], progress。"""
    activity = db.scalar(
        select(Activity)
        .where(Activity.id == activity_id)
        .options(selectinload(Activity.items))
    )
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    # members
    members = db.scalars(
        select(TeamMember)
        .where(TeamMember.team_id == activity.team_id)
        .options(joinedload(TeamMember.user))
    ).all()
    members_payload = []
    for m in members:
        members_payload.append(
            {
                "id": m.user_id,
                "nickname": m.user.nickname if m.user else f"用户{m.user_id}",
                "avatar": m.user.avatar if m.user else "👤",
                "role": m.role,
            }
        )

    # items: 附带 dish 基础信息
    items_payload: list[dict] = []
    if activity.items:
        dish_ids = list({it.dish_id for it in activity.items})
        dish_map = {d.id: d for d in db.scalars(select(Dish).where(Dish.id.in_(dish_ids))).all()}
        # 批量查用户信息
        user_ids = list({it.added_by for it in activity.items} | {it.chef_id for it in activity.items if it.chef_id})
        user_map = {}
        if user_ids:
            for u in db.scalars(select(User).where(User.id.in_(user_ids))).all():
                user_map[u.id] = u
        for it in sorted(activity.items, key=lambda x: x.id):
            dish = dish_map.get(it.dish_id)
            added_user = user_map.get(it.added_by)
            chef_user = user_map.get(it.chef_id) if it.chef_id else None
            items_payload.append(
                {
                    "id": it.id,
                    "dish_id": it.dish_id,
                    "dish_name": dish.name if dish else None,
                    "dish_emoji": dish.emoji if dish else None,
                    "quantity": it.quantity,
                    "added_by": it.added_by,
                    "added_by_nickname": added_user.nickname if added_user else None,
                    "chef_id": it.chef_id,
                    "chef_nickname": chef_user.nickname if chef_user else None,
                    "status": it.status,
                    "added_at": it.added_at.strftime("%Y-%m-%d %H:%M:%S") if it.added_at else None,
                }
            )

    ingredients = _ingredients_for_activity(db, activity, user)

    total_items = len(items_payload)
    done_items = sum(1 for it in items_payload if it["status"] == "done")
    progress = {
        "status": activity.status,
        "percent": _PROGRESS_PERCENT.get(activity.status, 0),
        "total": total_items,
        "done": done_items,
    }

    return ok(
        {
            **_activity_to_dict(activity),
            "members": members_payload,
            "items": items_payload,
            "ingredients": ingredients,
            "progress": progress,
        }
    )


@router.post("/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    body: ActivityStatusIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """单向流转 ordering→preparing→cooking→completed，需 with_for_update 行锁，非法流转 40003。"""
    target = body.target.strip()
    if target not in _ALL_STATUSES:
        raise ApiError(400, 40003, f"未知活动状态：{target}")

    # 行锁
    activity = db.scalar(
        select(Activity).where(Activity.id == activity_id).with_for_update()
    )
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    current = activity.status
    if target == current:
        raise ApiError(400, 40003, f"活动已处于 {target} 状态")
    allowed = _STATUS_FLOW.get(current, set())
    if target not in allowed:
        raise ApiError(400, 40003, f"活动状态不能从 {current} 流转到 {target}")

    activity.status = target
    db.commit()
    db.refresh(activity)
    return ok(_activity_to_dict(activity))
