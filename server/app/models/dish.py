"""菜品分类 / 菜品 模型（M2.3）。"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Category(Base):
    """菜品分类（原型 6 类）。"""

    __tablename__ = "categories"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    icon: Mapped[str] = mapped_column(String(8), nullable=False, default="🍽", server_default="🍽")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    dishes: Mapped[list[Dish]] = relationship(back_populates="category")


class Dish(Base):
    """菜品；ingredients 为 JSON 数组字符串（第四期菜谱留位）。"""

    __tablename__ = "dishes"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1), nullable=False, default=0, server_default="0")
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    emoji: Mapped[str] = mapped_column(String(16), nullable=False, default="🍽", server_default="🍽")
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#4CAF50", server_default="#4CAF50")
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ingredients: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    cook_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(8), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("1"))

    category: Mapped[Category] = relationship(back_populates="dishes")