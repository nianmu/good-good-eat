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
    is_public: bool = False


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
