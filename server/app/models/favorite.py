"""用户收藏菜品模型（四期：收藏）。user+dish 唯一，重复收藏幂等。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Favorite(Base):
    """用户对菜品的收藏记录；唯一键 user_id + dish_id。"""

    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "dish_id", name="uq_favorite_user_dish"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    dish: Mapped["Dish"] = relationship()
