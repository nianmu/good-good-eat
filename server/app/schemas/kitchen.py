"""四期「菜谱库/厨房」相关请求模型：菜谱 / 冰箱 / 菜篮 / 收藏。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class RecipeCreateIn(BaseModel):
    """创建 / 编辑菜谱。"""

    name: str = Field(min_length=1, max_length=64)
    emoji: str = Field(default="🍽", max_length=16)
    color: str = Field(default="#4CAF50", max_length=16)
    description: str = Field(default="", max_length=1000)
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    cook_time: int | None = Field(default=None, ge=1, le=24 * 60)
    difficulty: str | None = Field(default=None, max_length=8)
    image_url: str | None = Field(default=None, max_length=255)
    category_id: int | None = Field(default=None)
    is_public: bool = False


class DishCreateIn(BaseModel):
    """新建菜品（可见性三态；team 时必填 team_id；recipe 可选一键建菜谱）。"""

    category_id: int
    name: str = Field(min_length=1, max_length=64)
    price: float = Field(default=0, ge=0, le=999999)
    emoji: str = Field(default="🍽", max_length=16)
    color: str = Field(default="#4CAF50", max_length=16)
    description: str = Field(default="", max_length=1000)
    ingredients: list[str] = Field(default_factory=list)
    cook_time: int | None = Field(default=None, ge=1, le=24 * 60)
    difficulty: str | None = Field(default=None, max_length=8)
    visibility: str = Field(default="public", pattern="^(public|team|private)$")
    team_id: int | None = Field(default=None)
    recipe: RecipeCreateIn | None = Field(default=None)


class DishEditIn(BaseModel):
    """编辑自建菜品（允许改可见性；仅创建者可改）。"""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    emoji: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=1000)
    price: float | None = Field(default=None, ge=0, le=999999)
    ingredients: list[str] | None = Field(default=None)
    cook_time: int | None = Field(default=None, ge=1, le=24 * 60)
    difficulty: str | None = Field(default=None, max_length=8)
    visibility: str | None = Field(default=None, pattern="^(public|team|private)$")
    team_id: int | None = Field(default=None)


class FridgeUpsertIn(BaseModel):
    """新增 / 同名覆盖冰箱食材。"""

    name: str = Field(min_length=1, max_length=64)
    quantity: str = Field(default="", max_length=32)


class BasketUpsertIn(BaseModel):
    """新增 / 合并菜篮项。"""

    name: str = Field(min_length=1, max_length=64)
    quantity: str = Field(default="", max_length=32)


class BasketCheckIn(BaseModel):
    """勾选 / 取消勾选菜篮项。"""

    checked: bool
