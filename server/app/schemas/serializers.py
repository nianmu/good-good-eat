"""模型 → 字典 序列化辅助（统一 API 输出形状）。"""

from __future__ import annotations

import json
from typing import Any

from app.models.dish import Category, Dish
from app.models.message import Message
from app.models.order import Order, OrderItem
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