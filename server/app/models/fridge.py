"""厨房冰箱食材模型（四期：厨房管理）。同名食材按 user+name 覆盖。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FridgeItem(Base):
    """用户冰箱里的食材；user+name 唯一，重复添加覆盖 quantity。"""

    __tablename__ = "fridge_items"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_fridge_user_name"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
