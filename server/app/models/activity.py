"""活动 / 活动菜品 模型。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Activity(Base):
    """活动；归属团队，按类型/状态流转。"""

    __tablename__ = "activities"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(Enum("daily", "party", name="activity_type"), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("ordering", "preparing", "cooking", "completed", name="activity_status"),
        nullable=False,
        default="ordering",
        server_default="ordering",
        index=True,
    )
    people: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    team: Mapped["Team"] = relationship(foreign_keys=[team_id])
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    items: Mapped[list[ActivityItem]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )


class ActivityItem(Base):
    """活动菜品明细；同一活动内 dish + added_by 唯一。"""

    __tablename__ = "activity_items"
    __table_args__ = (
        UniqueConstraint("activity_id", "dish_id", "added_by", name="uq_activity_item"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"), nullable=False, index=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    added_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "prepared", "cooking", "done", name="item_status"),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    added_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    activity: Mapped[Activity] = relationship(back_populates="items")
    dish: Mapped["Dish"] = relationship()
    added_user: Mapped["User"] = relationship(foreign_keys=[added_by])
    chef: Mapped["User | None"] = relationship(foreign_keys=[chef_id])
