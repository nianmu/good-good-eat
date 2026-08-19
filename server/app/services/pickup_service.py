"""取餐码生成（M2.4）：团队维度 + 当日递增短号，从 1001 开始，跨日重置。

并发安全：事务内先以团队行 `SELECT ... FOR UPDATE` 作为串行化点，
再取当日最大号 +1；调用方须在同一个事务内完成订单写入并提交。
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.user import Team

_START_CODE = 1001


def next_pickup_code(db: Session, team_id: int, pickup_date: date) -> str:
    """返回该团队指定日期的下一个取餐码（当日最大号 + 1，起始 1001）。"""
    # 锁团队行，串行化同团队同日取号（必须处于事务中）
    db.execute(select(Team.id).where(Team.id == team_id).with_for_update())

    last = db.execute(
        select(Order.pickup_code)
        .where(Order.team_id == team_id, Order.pickup_date == pickup_date)
        .order_by(Order.pickup_code.desc())
        .limit(1)
    ).scalar_one_or_none()

    if last is None:
        return str(_START_CODE)
    return str(int(last) + 1)