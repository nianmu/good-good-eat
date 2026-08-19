"""消息中心（三期）：我的消息列表 / 标记已读。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import ApiError
from app.core.responses import ok
from app.core.security import get_current_user
from app.models.message import Message
from app.models.user import User
from app.schemas.serializers import message_to_dict

router = APIRouter()


@router.get("/messages")
def list_messages(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """我的消息分页（倒序）+ 未读数。"""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    total = db.scalar(select(func.count(Message.id)).where(Message.user_id == user.id)) or 0
    unread = (
        db.scalar(
            select(func.count(Message.id)).where(
                Message.user_id == user.id, Message.is_read.is_(False)
            )
        )
        or 0
    )
    items = db.scalars(
        select(Message)
        .where(Message.user_id == user.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ok(
        {
            "total": total,
            "unread_count": unread,
            "page": page,
            "page_size": page_size,
            "items": [message_to_dict(m) for m in items],
        }
    )


@router.post("/messages/{message_id}/read")
def mark_read(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """标记已读；非本人消息 40301。"""
    msg = db.get(Message, message_id)
    if msg is None:
        raise ApiError(404, 40401, "消息不存在")
    if msg.user_id != user.id:
        raise ApiError(403, 40301, "无权操作该消息")
    msg.is_read = True
    db.commit()
    return ok(message_to_dict(msg))