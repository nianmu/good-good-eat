"""用户饮食计划模型（五期：饮食计划）。

- plan 保存「我的饮食计划」（一周 / 一顿的菜品搭配）
- plan_items 记录每个菜品及数量（PlanItem：id, plan_id FK, dish_id FK, quantity）
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.dish import Dish


class Plan(Base):
    """我的饮食计划；属于某个用户（user_id FK）。"""

    __tablename__ = "plans"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    items: Mapped[list[PlanItem]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanItem(Base):
    """计划内的菜品项；dish_id 关联平台菜品，quantity 为份数。"""

    __tablename__ = "plan_items"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), nullable=False, index=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    plan: Mapped[Plan] = relationship(back_populates="items")
    dish: Mapped[Dish | None] = relationship()
