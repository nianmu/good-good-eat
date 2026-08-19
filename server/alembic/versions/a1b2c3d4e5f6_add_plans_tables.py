"""add plans tables

五期：饮食计划 新增 plans / plan_items 两张表。

性能索引说明（五期）：
- orders.team_id / orders.user_id / order_items.order_id / messages.user_id /
  team_members.team_id / team_members.user_id / favorites.user_id / favorites.dish_id /
  dishes.category_id —— 以上高频查询列均已在既有迁移(init_tables / add_messages /
  add_favorite_*)中建立索引，无需重复创建。
- 本次仅新增 plans.user_id、plan_items.plan_id、plan_items.dish_id 索引。

Revision ID: a1b2c3d4e5f6
Revises: e68eaf5a589d
Create Date: 2026-08-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e68eaf5a589d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('plans',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.String(length=64), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    mysql_charset='utf8mb4'
    )
    op.create_index(op.f('ix_plans_user_id'), 'plans', ['user_id'], unique=False)
    op.create_table('plan_items',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('plan_id', sa.BigInteger(), nullable=False),
    sa.Column('dish_id', sa.BigInteger(), nullable=False),
    sa.Column('quantity', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['dish_id'], ['dishes.id'], ),
    sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ),
    sa.PrimaryKeyConstraint('id'),
    mysql_charset='utf8mb4'
    )
    op.create_index(op.f('ix_plan_items_dish_id'), 'plan_items', ['dish_id'], unique=False)
    op.create_index(op.f('ix_plan_items_plan_id'), 'plan_items', ['plan_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_plan_items_plan_id'), table_name='plan_items')
    op.drop_index(op.f('ix_plan_items_dish_id'), table_name='plan_items')
    op.drop_table('plan_items')
    op.drop_index(op.f('ix_plans_user_id'), table_name='plans')
    op.drop_table('plans')
