"""订单 / 订单项 模型（M2.4）。订单项保存菜品快照，防菜品下架影响历史订单。"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.dish import Dish
from app.models.user import Team, User


class Order(Base):
    """订单；pickup_code 为团队维度当日递增短号（从 1001 开始）。"""

    __tablename__ = "orders"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    pickup_code: Mapped[str] = mapped_column(String(8), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "cooking", "ready", "completed", name="order_status"),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    team: Mapped[Team] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    chef: Mapped[User | None] = relationship(foreign_keys=[chef_id])


class OrderItem(Base):
    """订单项：菜品快照（name/emoji/color/price），dish_id 可空。
    user_id 记录该菜品的点餐人（团队多人点餐场景）。
    """

    __tablename__ = "order_items"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    dish_id: Mapped[int | None] = mapped_column(ForeignKey("dishes.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    dish: Mapped[Dish | None] = relationship()
    item_user: Mapped[User | None] = relationship(foreign_keys=[user_id])