"""饮食计划模块（五期）：保存 / 查看 / 删除 我的饮食计划。

概念：一个 plan = {name, note, items: [{dish_id, quantity}]}。
- POST /plans    新建我的计划
- GET  /plans    我的计划列表（分页，含菜品摘要）
- GET  /plans/{id}  详情（本人可看，否则 40301）
- DELETE /plans/{id}  删除
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.dish import Dish
from app.models.plan import Plan, PlanItem
from app.models.user import User
from app.schemas.plans import PlanCreateIn
from app.schemas.serializers import plan_to_dict

router = APIRouter()


def _summary_items(db: Session, plans: list[Plan]) -> list[dict]:
    """为列表批量取每个计划的菜品摘要（菜品名/emoji 列表，供前端卡片展示）。"""
    plan_ids = [p.id for p in plans]
    if not plan_ids:
        return []
    items = db.scalars(
        select(PlanItem)
        .where(PlanItem.plan_id.in_(plan_ids))
        .options(joinedload(PlanItem.dish))
        .order_by(PlanItem.id)
    ).all()
    mapping: dict[int, list[dict]] = {}
    for it in items:
        mapping.setdefault(it.plan_id, []).append(
            {
                "dish_id": it.dish_id,
                "quantity": it.quantity,
                "name": it.dish.name if it.dish else None,
                "emoji": it.dish.emoji if it.dish else None,
            }
        )
    return [mapping.get(p.id, []) for p in plans]


@router.post("/plans")
def create_plan(
    body: PlanCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """保存我的饮食计划；items 菜品需对当前用户可见且在售，重复 dish_id 合并数量。"""
    from app.api.v1.dishes import visible_dish

    merged: dict[int, int] = {}
    for it in body.items:
        dish = visible_dish(db, it.dish_id, user)
        if dish is None or not dish.is_active:
            raise ApiError(404, 40401, "菜品不存在或已下架")
        merged[it.dish_id] = merged.get(it.dish_id, 0) + it.quantity

    plan = Plan(user_id=user.id, name=body.name.strip(), note=body.note)
    for dish_id, quantity in merged.items():
        plan.items.append(PlanItem(dish_id=dish_id, quantity=quantity))
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return ok(plan_to_dict(plan, include_items=True))


@router.get("/plans")
def list_plans(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的计划列表（分页，created_at 倒序，含菜品摘要 summary）。"""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    conds = [Plan.user_id == user.id]
    total = db.scalar(select(func.count(Plan.id)).where(*conds)) or 0
    plans = db.scalars(
        select(Plan)
        .where(*conds)
        .order_by(Plan.created_at.desc(), Plan.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    summaries = _summary_items(db, plans)
    items = []
    for p, summary in zip(plans, summaries):
        data = plan_to_dict(p)
        data["summary"] = summary
        data["total_count"] = sum(it["quantity"] for it in summary)
        items.append(data)

    return ok(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
    )


def _get_own_plan(db: Session, plan_id: int, user: User) -> Plan:
    """加载本人计划；不存在 40401 / 非本人 40301。"""
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise ApiError(404, 40401, "计划不存在")
    if plan.user_id != user.id:
        raise ApiError(403, 40301, "无权访问该计划")
    return plan


@router.get("/plans/{plan_id}")
def get_plan(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """计划详情（本人可看；含菜品清单与合计数量）。"""
    plan = _get_own_plan(db, plan_id, user)
    return ok(plan_to_dict(plan, include_items=True))


@router.delete("/plans/{plan_id}")
def delete_plan(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """删除计划；不存在或非本人 40401/40301。"""
    plan = _get_own_plan(db, plan_id, user)
    db.delete(plan)
    db.commit()
    return ok({"id": plan_id})
