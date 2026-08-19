"""厨房菜篮（待采购）模型（四期：厨房管理）。同名待购项合并。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BasketItem(Base):
    """用户菜篮待采购项；user+name 唯一，重复添加合并。checked 标记是否已完成勾选。"""

    __tablename__ = "basket_items"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="", server_default="")
    checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
