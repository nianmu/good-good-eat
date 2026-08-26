"""drop legacy order/message tables (activity refactor finale)

- orders / order_items：旧"按人下单"体系，已被 activities 全面替代，删除
- messages：站内消息唯一生产者是订单通知，随订单下线；活动协作改用 WS 实时
- 同时清理 message_type 枚举依赖（已随表删除）

Revision ID: f0a1b2c3d4e5
Revises: e5a6b7c8d9e0
Create Date: 2026-08-25 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'e5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('messages')


def downgrade() -> None:
    """Downgrade schema.（打翻重来：不回滚删除的表结构，历史数据已弃）"""
    pass