"""模型 → 字典 序列化辅助（统一 API 输出形状）。"""

from __future__ import annotations

import json
from typing import Any

from app.models.basket import BasketItem
from app.models.dish import Category, Dish
from app.models.fridge import FridgeItem
from app.models.message import Message
from app.models.order import Order, OrderItem
from app.models.plan import Plan, PlanItem
from app.models.recipe import Recipe
from app.models.user import User


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "user_code": user.user_code,
        "is_guest": user.is_guest,
    }


def category_to_dict(category: Category) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "icon": category.icon,
        "sort_order": category.sort_order,
    }


def dish_to_dict(dish: Dish) -> dict:
    ingredients: Any = None
    if dish.ingredients:
        try:
            ingredients = json.loads(dish.ingredients)
        except (json.JSONDecodeError, TypeError):
            ingredients = None
    return {
        "id": dish.id,
        "category_id": dish.category_id,
        "name": dish.name,
        "price": float(dish.price),
        "rating": float(dish.rating),
        "rating_count": dish.rating_count,
        "description": dish.description,
        "emoji": dish.emoji,
        "color": dish.color,
        "image_url": dish.image_url,
        "ingredients": ingredients,
        "cook_time": dish.cook_time,
        "difficulty": dish.difficulty,
        "is_active": dish.is_active,
    }


def _json_arr(value: str | None) -> Any:
    """把 JSON 数组字符串解析为列表；空/非法返回 None。"""
    if not value:
        return None
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


def recipe_to_dict(recipe: Recipe, with_owner: bool = False) -> dict:
    """用户自建菜谱 → dict。"""
    data: dict[str, Any] = {
        "id": recipe.id,
        "name": recipe.name,
        "emoji": recipe.emoji,
        "color": recipe.color,
        "description": recipe.description,
        "ingredients": _json_arr(recipe.ingredients) or [],
        "steps": _json_arr(recipe.steps) or [],
        "cook_time": recipe.cook_time,
        "difficulty": recipe.difficulty,
        "image_url": recipe.image_url,
        "is_public": recipe.is_public,
        "created_at": recipe.created_at.strftime("%Y-%m-%d %H:%M:%S") if recipe.created_at else None,
    }
    if with_owner:
        data["user_id"] = recipe.user_id
    return data


def fridge_item_to_dict(item: FridgeItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "quantity": item.quantity,
        "updated_at": item.updated_at.strftime("%Y-%m-%d %H:%M:%S") if item.updated_at else None,
    }


def basket_item_to_dict(item: BasketItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "quantity": item.quantity,
        "checked": item.checked,
        "created_at": item.created_at.strftime("%Y-%m-%d %H:%M:%S") if item.created_at else None,
    }


def order_item_to_dict(item: OrderItem) -> dict:
    return {
        "dish_id": item.dish_id,
        "name": item.name,
        "emoji": item.emoji,
        "color": item.color,
        "price": float(item.price),
        "quantity": item.quantity,
    }


def message_to_dict(msg: Message) -> dict:
    return {
        "id": msg.id,
        "type": msg.type,
        "title": msg.title,
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.strftime("%Y-%m-%d %H:%M:%S") if msg.created_at else None,
    }


def plan_item_to_dict(item: PlanItem) -> dict:
    """计划内菜品项。菜品信息复用 dish_to_dict（dish 下架时保留 dish_id + name）。"""
    dish = item.dish
    data: dict[str, Any] = {
        "dish_id": item.dish_id,
        "quantity": item.quantity,
    }
    if dish is not None:
        data["dish"] = dish_to_dict(dish)
    else:
        data["dish"] = None
        data["name"] = None
    return data


def plan_to_dict(plan: Plan, include_items: bool = False) -> dict:
    """计划 → dict；include_items 时附带菜品清单（含摘要）。"""
    data: dict[str, Any] = {
        "id": plan.id,
        "user_id": plan.user_id,
        "name": plan.name,
        "note": plan.note,
        "created_at": plan.created_at.strftime("%Y-%m-%d %H:%M:%S") if plan.created_at else None,
    }
    if include_items:
        data["items"] = [plan_item_to_dict(i) for i in plan.items]
        total = sum(i.quantity for i in plan.items)
        data["total_count"] = total
    return data


def order_to_dict(order: Order, include_items: bool = True, with_user: bool = False) -> dict:
    data: dict[str, Any] = {
        "id": order.id,
        "order_no": order.order_no,
        "pickup_code": order.pickup_code,
        "status": order.status,
        "team_id": order.team_id,
        "team_name": order.team.name if order.team else None,
        "chef_id": order.chef_id,
        "total_amount": float(order.total_amount),
        "total_count": order.total_count,
        "pickup_date": order.pickup_date.isoformat() if order.pickup_date else None,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else None,
    }
    if with_user:
        data["user"] = (
            {
                "id": order.user.id,
                "nickname": order.user.nickname,
                "avatar": order.user.avatar,
            }
            if order.user
            else None
        )
    if include_items:
        data["items"] = [order_item_to_dict(i) for i in order.items]
    return data