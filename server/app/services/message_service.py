"""站内消息写入（三期）：订单事件 → 用户消息埋点。

只负责「写」：由订单创建 / 状态流转 / 认领等既有流转处调用，
不影响原订单业务行为（增补通知）。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.order import Order
from app.models.user import User

# 状态 → 内容模板（code=取餐码；name=厨师昵称）
_STATUS_CONTENT: dict[str, str] = {
    "accepted": "订单 {code} 已被接单（厨师：{name}）",
    "cooking": "订单 {code} 已开始制作（厨师：{name}）",
    "ready": "订单 {code} 已出餐，请来取餐",
    "completed": "订单 {code} 已完成，感谢惠顾",
}


def create_message(
    db: Session,
    user_id: int,
    type_: str = "order",
    title: str = "",
    content: str = "",
) -> Message:
    """落一条消息（不提交，由调用方统一 commit）。"""
    msg = Message(user_id=user_id, type=type_, title=title, content=content)
    db.add(msg)
    return msg


def notify_order_created(db: Session, order: Order) -> None:
    """订单创建（pending）→ 通知团队固定厨师；无固定厨师则通知全体成员（每人一条）。"""
    team = order.team
    if team is None:
        return
    title = f"新订单 {order.pickup_code}"
    content = f"新订单 取餐码 {order.pickup_code} 待接单"
    if team.chef_id is not None:
        create_message(db, team.chef_id, "order", title, content)
    else:
        for member in team.members:
            create_message(db, member.user_id, "order", title, content)
    db.commit()


def notify_order_status_changed(db: Session, order: Order, actor: User) -> None:
    """状态流转 accepted/cooking/ready/completed → 通知下单人。"""
    template = _STATUS_CONTENT.get(order.status)
    if template is None:
        return
    chef_name = order.chef.nickname if order.chef is not None else actor.nickname
    content = template.format(code=order.pickup_code, name=chef_name)
    create_message(
        db,
        order.user_id,
        "order",
        f"订单 {order.pickup_code} 状态更新",
        content,
    )
    db.commit()


def notify_order_claimed(db: Session, order: Order, actor: User) -> None:
    """成员认领订单 → 通知下单人。"""
    create_message(
        db,
        order.user_id,
        "order",
        f"订单 {order.pickup_code} 已认领",
        f"成员 {actor.nickname} 认领了你的订单",
    )
    db.commit()