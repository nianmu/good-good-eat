"""订单模块（M2.4）：下单 / 我的订单 / 详情 / 接单 / 认领 / 状态流转。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.order import Order
from app.models.user import TeamMember, User
from app.schemas.orders import OrderCreateIn, OrderStatusIn
from app.schemas.serializers import order_to_dict
from app.services import order_service

router = APIRouter()


def _get_order_for_user(db: Session, order_id: int, user: User) -> Order:
    """加载订单（team/user/items 预加载）；不存在 40401，非本人且非团队成员 40301。"""
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(joinedload(Order.team), joinedload(Order.user), selectinload(Order.items))
    )
    if order is None:
        raise ApiError(404, 40401, "订单不存在")
    if order.user_id != user.id:
        member = db.scalar(
            select(TeamMember).where(
                TeamMember.team_id == order.team_id, TeamMember.user_id == user.id
            )
        )
        if member is None:
            raise ApiError(403, 40301, "无权访问该订单")
    return order


@router.post("/orders")
def create_order(
    body: OrderCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """下单：校验团队/成员/菜品，生成取餐码，返回完整订单（status=pending）。"""
    order = order_service.create_order(db, user, body.team_id, body.items)
    return ok(order_to_dict(order))


@router.get("/orders")
def list_orders(
    page: int = 1,
    page_size: int = 10,
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的订单分页列表（created_at 倒序，含团队名与菜品快照）。"""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = [Order.user_id == user.id]
    if status:
        conds.append(Order.status == status)

    total = db.scalar(select(func.count(Order.id)).where(*conds)) or 0
    orders = db.scalars(
        select(Order)
        .where(*conds)
        .options(joinedload(Order.team), selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [order_to_dict(o) for o in orders],
        }
    )


@router.get("/orders/{order_id}")
def get_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """订单详情；本人或同团队成员可看，含 items / team_name / 下单人昵称头像。"""
    order = _get_order_for_user(db, order_id, user)
    return ok(order_to_dict(order, with_user=True))


@router.post("/orders/{order_id}/accept")
def accept_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """厨师接单：pending → accepted。

    权限：团队有固定厨师时，只有固定厨师能接单（40305）；
    无固定厨师时，团队成员均可接单（接单者记为 chef）。
    """
    order = _get_order_for_user(db, order_id, user)
    if order.status != "pending":
        raise ApiError(400, 40003, "当前状态不可接单")
    team = order.team
    if team is not None and team.chef_id is not None:
        # 团队有固定厨师：只有固定厨师能接单
        if user.id != team.chef_id:
            raise ApiError(403, 40305, "团队已设固定厨师，只有厨师可以接单")
    order.status = "accepted"
    order.chef_id = user.id
    db.commit()
    db.refresh(order)
    # 三期：通知下单人「已被接单」
    from app.services import message_service

    message_service.notify_order_status_changed(db, order, user)
    return ok(order_to_dict(order))


@router.post("/orders/{order_id}/claim")
def claim_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """认领厨师：团队有固定厨师 40002；订单已被他人认领 40004。"""
    order = _get_order_for_user(db, order_id, user)
    team = order.team
    if team is not None and team.chef_id is not None:
        raise ApiError(400, 40002, "团队已设固定厨师，无法认领")
    if order.chef_id is not None and order.chef_id != user.id:
        raise ApiError(400, 40004, "该订单已被其他成员认领为厨师")
    order.chef_id = user.id
    db.commit()
    db.refresh(order)
    # 三期：通知下单人「已认领」
    from app.services import message_service

    message_service.notify_order_claimed(db, order, user)
    return ok(order_to_dict(order))


@router.post("/orders/{order_id}/status")
def update_status(
    order_id: int,
    body: OrderStatusIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """状态单向流转；非法转移 40003；流转到 completed 且无厨师时记录当前用户。"""
    order = _get_order_for_user(db, order_id, user)
    order = order_service.transition_order_status(db, order, body.status, user)
    return ok(order_to_dict(order))