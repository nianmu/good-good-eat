"""厨师看板（三期）：我收到的订单 / 按菜聚合 + 食材汇总。"""

from __future__ import annotations

import json
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.db import get_db
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.dish import Dish
from app.models.order import Order
from app.models.user import Team, TeamMember, User
from app.schemas.serializers import order_to_dict

router = APIRouter()

# 厨师视角可见的订单状态（待做/进行中）
_ACTIVE_STATUSES = ("pending", "accepted", "cooking", "ready")


def _my_chef_order_query(user_id: int):
    """我作为厨师收到的订单：团队固定厨师==我 或 订单 chef_id==我。"""
    return (
        select(Order)
        .where(
            Order.status.in_(_ACTIVE_STATUSES),
            (
                (Order.team_id.in_(
                    select(Team.id).where(Team.chef_id == user_id)
                ))
                | (Order.chef_id == user_id)
            ),
        )
        .options(
            joinedload(Order.team),
            joinedload(Order.user),
            selectinload(Order.items),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
    )


@router.get("/chef/orders")
def chef_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我作为厨师收到的订单列表（待接单→待取餐，倒序）。"""
    orders = db.scalars(_my_chef_order_query(user.id)).all()
    return ok({"total": len(orders), "items": [order_to_dict(o, with_user=True) for o in orders]})


@router.get("/chef/orders/aggregated")
def chef_orders_aggregated(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """按菜品合并数量 + 展开食材汇总（基于待做订单）。"""
    orders = db.scalars(_my_chef_order_query(user.id)).all()

    # 按菜品名聚合数量
    dish_counter: Counter[str] = Counter()
    dish_meta: dict[str, dict] = {}  # name -> {emoji, ingredients}
    dish_ids: set[int] = set()

    for order in orders:
        for item in order.items:
            dish_counter[item.name] += item.quantity
            dish_meta.setdefault(item.name, {"emoji": item.emoji, "ingredients": []})
            if item.dish_id:
                dish_ids.add(item.dish_id)

    # 食材展开：从菜品表读 ingredients（JSON 数组）
    if dish_ids:
        dishes = db.scalars(select(Dish).where(Dish.id.in_(dish_ids))).all()
        id_to_dish = {d.id: d for d in dishes}
        for order in orders:
            for item in order.items:
                if item.dish_id and item.dish_id in id_to_dish:
                    ing = _parse_ingredients(id_to_dish[item.dish_id].ingredients)
                    dish_meta[item.name]["ingredients"] = ing

    ingredients_counter: Counter[str] = Counter()
    for meta in dish_meta.values():
        for name in meta["ingredients"]:
            ingredients_counter[name] += 1

    dishes_payload = [
        {
            "dish_name": name,
            "emoji": meta["emoji"],
            "total_quantity": qty,
            "ingredients": meta["ingredients"],
        }
        for name, (qty, meta) in sorted(
            ((n, (q, dish_meta[n])) for n, q in dish_counter.items()),
            key=lambda x: -x[1][0],
        )
    ]

    return ok(
        {
            "orders_count": len(orders),
            "dishes": dishes_payload,
            "ingredients": [
                {"name": name, "count": cnt}
                for name, cnt in ingredients_counter.most_common()
            ],
        }
    )


def _parse_ingredients(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
    except (json.JSONDecodeError, TypeError):
        pass
    return []