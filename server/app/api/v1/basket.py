"""厨房菜篮（待采购）模块（四期）增删改查 + 勾选完成。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.basket import BasketItem
from app.models.user import User
from app.schemas.kitchen import BasketCheckIn, BasketUpsertIn
from app.schemas.serializers import basket_item_to_dict

router = APIRouter()


@router.get("/basket")
def list_basket(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的菜篮（待采购）列表，未完成在前，按创建时间倒序。"""
    items = db.scalars(
        select(BasketItem)
        .where(BasketItem.user_id == user.id)
        .order_by(BasketItem.checked.asc(), BasketItem.created_at.desc(), BasketItem.id.desc())
    ).all()
    return ok([basket_item_to_dict(i) for i in items])


@router.post("/basket")
def upsert_basket(
    body: BasketUpsertIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """添加菜篮待购项；同名合并。并发插入撞唯一约束时回落为更新。"""
    name = body.name.strip()
    existing = db.scalar(
        select(BasketItem)
        .where(BasketItem.user_id == user.id, BasketItem.name == name)
        .limit(1)
    )
    if existing is None:
        item = BasketItem(user_id=user.id, name=name, quantity=body.quantity)
        db.add(item)
        try:
            db.commit()
        except IntegrityError:
            # 并发下另一请求已插入同名 → 回滚后转为更新
            db.rollback()
            item = db.scalar(
                select(BasketItem).where(BasketItem.user_id == user.id, BasketItem.name == name).limit(1)
            )
            if item is None:
                raise ApiError(500, 50000, "菜篮保存失败，请重试") from None
        else:
            db.refresh(item)
            return ok(basket_item_to_dict(item))
    else:
        item = existing
    if body.quantity:
        item.quantity = body.quantity
    item.checked = False
    db.commit()
    db.refresh(item)
    return ok(basket_item_to_dict(item))


@router.put("/basket/{item_id}")
def check_basket(
    item_id: int,
    body: BasketCheckIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """勾选 / 取消勾选菜篮项；不存在 40401。"""
    item = db.get(BasketItem, item_id)
    if item is None or item.user_id != user.id:
        raise ApiError(404, 40401, "菜篮项不存在")
    item.checked = body.checked
    db.commit()
    db.refresh(item)
    return ok(basket_item_to_dict(item))


@router.delete("/basket/{item_id}")
def delete_basket(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """删除菜篮项；不存在 40401。"""
    item = db.get(BasketItem, item_id)
    if item is None or item.user_id != user.id:
        raise ApiError(404, 40401, "菜篮项不存在")
    db.delete(item)
    db.commit()
    return ok({"id": item_id})
