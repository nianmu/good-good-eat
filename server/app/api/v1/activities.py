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
from app.schemas.activities import (
    ActivityCreateIn,
    ActivityItemChefIn,
    ActivityItemCreateIn,
    ActivityItemStatusIn,
    ActivityStatusIn,
)

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

_ITEM_STATUS_FLOW: dict[str, set[str]] = {
    "pending": {"prepared"},
    "prepared": {"cooking"},
    "cooking": {"done"},
    "done": set(),
}
_ALL_ITEM_STATUSES = set(_ITEM_STATUS_FLOW) | {s for vals in _ITEM_STATUS_FLOW.values() for s in vals}


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


def _member_role(db: Session, team_id: int, user_id: int) -> str | None:
    return db.scalar(select(TeamMember.role).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id))


def _item_to_dict(it: ActivityItem, dish: Dish | None, added_user: User | None, chef_user: User | None) -> dict:
    return {
        "id": it.id,
        "activity_id": it.activity_id,
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


@router.post("/{activity_id}/items")
def add_activity_item(
    activity_id: int,
    body: ActivityItemCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """点菜：校验 dish 存在且 active，quantity 1-999，防同人同菜重复累加。"""
    activity = db.scalar(select(Activity).where(Activity.id == activity_id))
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    dish = db.get(Dish, body.dish_id)
    if dish is None or not dish.is_active:
        raise ApiError(404, 40401, "菜品不存在或已下架")

    # 防同人同菜重复：若已存在则累加 quantity
    existing = db.scalar(
        select(ActivityItem)
        .where(
            ActivityItem.activity_id == activity_id,
            ActivityItem.dish_id == body.dish_id,
            ActivityItem.added_by == user.id,
        )
        .with_for_update()
    )
    if existing is not None:
        new_qty = existing.quantity + body.quantity
        if new_qty > 999:
            raise ApiError(400, 40000, "数量超出上限 999")
        existing.quantity = new_qty
        db.commit()
        db.refresh(existing)
        chef_user = db.get(User, existing.chef_id) if existing.chef_id else None
        return ok(_item_to_dict(existing, dish, user, chef_user))

    item = ActivityItem(
        activity_id=activity_id,
        dish_id=body.dish_id,
        quantity=body.quantity,
        added_by=user.id,
        chef_id=None,
        status="pending",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ok(_item_to_dict(item, dish, user, None))


@router.delete("/{activity_id}/items/{item_id}")
def remove_activity_item(
    activity_id: int,
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """移除：仅 added_by 或组织者可删。"""
    activity = db.scalar(select(Activity).where(Activity.id == activity_id))
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    item = db.scalar(select(ActivityItem).where(ActivityItem.id == item_id, ActivityItem.activity_id == activity_id))
    if item is None:
        raise ApiError(404, 40401, "菜品明细不存在")

    role = _member_role(db, activity.team_id, user.id)
    if item.added_by != user.id and role != "organizer":
        raise ApiError(403, 40301, "仅点菜人或组织者可移除")

    db.delete(item)
    db.commit()
    return ok({"item_id": item_id})


@router.put("/{activity_id}/items/{item_id}/chef")
def update_item_chef(
    activity_id: int,
    item_id: int,
    body: ActivityItemChefIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """改厨师：null 回落 team.chef_id，user_id 需为团队成员；任意成员可改自己为厨师或清空，组织者可改任意。"""
    activity = db.scalar(select(Activity).where(Activity.id == activity_id))
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    item = db.scalar(select(ActivityItem).where(ActivityItem.id == item_id, ActivityItem.activity_id == activity_id))
    if item is None:
        raise ApiError(404, 40401, "菜品明细不存在")

    team = db.get(Team, activity.team_id)
    target_user_id = body.user_id

    if target_user_id is not None:
        # 需为团队成员
        if db.scalar(select(TeamMember.id).where(TeamMember.team_id == activity.team_id, TeamMember.user_id == target_user_id)) is None:
            raise ApiError(400, 40002, "该成员不在团队中")
        # 权限：任意成员可改自己为厨师；组织者可改任意；其他情况 403
        role = _member_role(db, activity.team_id, user.id)
        if target_user_id != user.id and role != "organizer":
            raise ApiError(403, 40301, "仅组织者可指定他人为厨师")
    else:
        # 清空回落：任意成员可清空（或仅组织者/本人？按需求任意成员可清空）
        pass

    item.chef_id = target_user_id
    db.commit()
    db.refresh(item)
    dish = db.get(Dish, item.dish_id)
    added_user = db.get(User, item.added_by)
    chef_user = db.get(User, item.chef_id) if item.chef_id else None
    # 若 chef_id 为 null 且 team 有固定厨师，前端回落显示；此处不自动填充，保留 null
    return ok(_item_to_dict(item, dish, added_user, chef_user))


@router.put("/{activity_id}/items/{item_id}/status")
def update_item_status(
    activity_id: int,
    item_id: int,
    body: ActivityItemStatusIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """单菜推进 pending→prepared→cooking→done 单向，需 with_for_update，仅 item.chef_id（或回落 team.chef_id）可推，非法流转 40003。"""
    target = body.target.strip()
    if target not in _ALL_ITEM_STATUSES:
        raise ApiError(400, 40003, f"未知菜品状态：{target}")

    activity = db.scalar(select(Activity).where(Activity.id == activity_id))
    if activity is None:
        raise ApiError(404, 40401, "活动不存在")
    _ensure_member(db, activity.team_id, user.id)

    # 行锁
    item = db.scalar(
        select(ActivityItem).where(ActivityItem.id == item_id, ActivityItem.activity_id == activity_id).with_for_update()
    )
    if item is None:
        raise ApiError(404, 40401, "菜品明细不存在")

    # 权限：仅有效厨师可推
    team = db.get(Team, activity.team_id)
    effective_chef_id = item.chef_id if item.chef_id is not None else (team.chef_id if team else None)
    if effective_chef_id is None:
        raise ApiError(403, 40301, "仅厨师可推进状态")
    if user.id != effective_chef_id:
        raise ApiError(403, 40301, "仅厨师可推进状态")

    current = item.status
    if target == current:
        raise ApiError(400, 40003, f"菜品已处于 {target} 状态")
    allowed = _ITEM_STATUS_FLOW.get(current, set())
    if target not in allowed:
        raise ApiError(400, 40003, f"菜品状态不能从 {current} 流转到 {target}")

    item.status = target
    db.commit()
    db.refresh(item)
    dish = db.get(Dish, item.dish_id)
    added_user = db.get(User, item.added_by)
    chef_user = db.get(User, item.chef_id) if item.chef_id else None
    return ok(_item_to_dict(item, dish, added_user, chef_user))
