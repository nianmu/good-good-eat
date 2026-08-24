"""用户/平台菜谱模型（四期+最终版：公开菜谱库）。ingredients/steps 为 JSON 数组字符串。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Recipe(Base):
    """菜谱（用户自建 + 平台公开菜谱）。

    - ingredients: JSON 数组字符串（食材）
    - steps: JSON 数组字符串（步骤，供小程序分步渲染）
    - is_public: 是否公开（公开菜谱库：为 true 时所有人可浏览/收藏）
    - dish_id: 关联菜品（平台菜谱与菜单菜品一一对应，供菜品详情跳转公开菜谱）
    """

    __tablename__ = "recipes"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    dish_id: Mapped[int | None] = mapped_column(ForeignKey("dishes.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), nullable=False, default="🍽", server_default="🍽")
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#4CAF50", server_default="#4CAF50")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    ingredients: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    steps: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    cook_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(8), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RecipeFavorite(Base):
    """用户对菜谱的收藏记录；唯一键 user_id + recipe_id，重复收藏幂等。"""

    __tablename__ = "recipe_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "recipe_id", name="uq_recipe_favorite_user_recipe"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    recipe: Mapped[Recipe] = relationship()
