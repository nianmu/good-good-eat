"""订单业务逻辑（M2.4）：创建订单、金额/数量计算、取餐码、order_no。"""

from __future__ import annotations

import secrets
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models.dish import Dish
from app.models.order import Order, OrderItem
from app.models.user import Team, TeamMember, User
from app.schemas.orders import OrderItemIn
from app.services import message_service
from app.services.pickup_service import next_pickup_code


def create_order(db: Session, user: User, team_id: int, items: list[OrderItemIn]) -> Order:
    """创建订单（status=pending）。

    校验：团队存在、当前用户是团队成员；菜品存在且上架。
    order_no 格式 '%Y%m%d-%06d'（先 flush 取订单 id）；取餐码由 pickup_service 生成。
    """
    if not items:
        raise ApiError(400, 40000, "下单菜品不能为空")
    for it in items:
        if it.quantity < 1:
            raise ApiError(400, 40000, "菜品数量必须大于 0")

    team = db.get(Team, team_id)
    if team is None:
        raise ApiError(404, 40401, "团队不存在")

    membership = db.scalar(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    )
    if membership is None:
        raise ApiError(403, 40301, "你不是该团队成员，无法下单")

    dish_ids = list({it.dish_id for it in items})
    dishes = db.scalars(select(Dish).where(Dish.id.in_(dish_ids), Dish.is_active.is_(True))).all()
    dish_map = {d.id: d for d in dishes}
    missing = [did for did in dish_ids if did not in dish_map]
    if missing:
        raise ApiError(404, 40401, "部分菜品不存在或已下架")

    today = date.today()
    # 取餐码：锁团队行 + 查当日最大号 +1（与后续写入同一事务，提交时释放锁）
    pickup_code = next_pickup_code(db, team_id, today)

    order = Order(
        team_id=team_id,
        user_id=user.id,
        status="pending",
        pickup_date=today,
        total_amount=Decimal("0"),
        total_count=0,
        pickup_code=pickup_code,
        # order_no 依赖订单 id，先以临时占位满足 NOT NULL，flush 后按 id 重写
        order_no=f"TMP-{secrets.token_hex(6)}",
    )
    db.add(order)
    db.flush()  # 先取 order.id 用于 order_no

    total_amount = Decimal("0")
    total_count = 0
    for it in items:
        dish = dish_map[it.dish_id]
        item_user_id = getattr(it, 'user_id', None) or user.id
        order.items.append(
            OrderItem(
                dish_id=dish.id,
                user_id=item_user_id,
                name=dish.name,
                emoji=dish.emoji,
                color=dish.color,
                price=dish.price,
                quantity=it.quantity,
            )
        )
        total_amount += dish.price * it.quantity
        total_count += it.quantity

    order.total_amount = total_amount
    order.total_count = total_count
    order.order_no = f"{today:%Y%m%d}-{order.id:06d}"

    db.commit()
    db.refresh(order)
    # 三期：新订单通知（固定厨师或全体成员）
    message_service.notify_order_created(db, order)
    return order


# 状态单向流转图：pending → accepted → cooking → ready → completed
ORDER_STATUS_FLOW: dict[str, set[str]] = {
    "pending": {"accepted"},
    "accepted": {"cooking"},
    "cooking": {"ready"},
    "ready": {"completed"},
    "completed": set(),
}


def _resolve_chef_id(order: Order) -> int | None:
    """订单当前厨师：优先 order.chef_id（认领人），其次 team.chef_id（固定厨师）。"""
    if order.chef_id is not None:
        return order.chef_id
    team = order.team
    if team is not None and team.chef_id is not None:
        return team.chef_id
    return None


def transition_order_status(db: Session, order: Order, target: str, actor: User) -> Order:
    """单向状态流转；非法转移抛 40003。

    权限规则：
    - accepted / cooking / ready：只有当前订单厨师（order.chef_id 或 team.chef_id）能操作。
    - completed：厨师或下单人都能操作（下单人"确认取餐"）。
    - 无厨师时拒绝流转（40305）。
    """
    all_statuses = set(ORDER_STATUS_FLOW) | {s for vals in ORDER_STATUS_FLOW.values() for s in vals}
    if target not in all_statuses:
        raise ApiError(400, 40003, f"未知订单状态：{target}")
    if target == order.status:
        raise ApiError(400, 40003, f"订单已处于 {target} 状态")
    if target not in ORDER_STATUS_FLOW.get(order.status, set()):
        raise ApiError(400, 40003, f"订单状态不能从 {order.status} 流转到 {target}")

    chef_id = _resolve_chef_id(order)

    if target == "completed":
        # completed：厨师或下单人都能操作
        if chef_id is not None and actor.id != chef_id and actor.id != order.user_id:
            raise ApiError(403, 40305, "只有订单厨师或下单人可以确认取餐")
    else:
        # accepted / cooking / ready：只有厨师能操作
        if chef_id is None:
            raise ApiError(403, 40305, "当前订单没有厨师，请先指定厨师或认领做菜")
        if actor.id != chef_id:
            raise ApiError(403, 40305, "只有订单厨师可以操作状态流转")

    order.status = target
    if target == "completed" and order.chef_id is None:
        order.chef_id = actor.id
    db.commit()
    db.refresh(order)
    # 三期：状态流转通知下单人（accepted/cooking/ready/completed 均有模板）
    message_service.notify_order_status_changed(db, order, actor)
    return order