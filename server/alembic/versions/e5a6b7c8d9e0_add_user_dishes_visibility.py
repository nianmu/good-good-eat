"""add user dishes visibility + recipe category

- dishes: +created_by NULL、+visibility ENUM('public','team','private') DEFAULT 'public'、+team_id NULL
- recipes: +category_id NULL（复用 categories）
- 回填：存量 dishes 全部 public/NULL；存量公开菜谱按 dish_id → dish.category_id 回填

Revision ID: e5a6b7c8d9e0
Revises: d3f8a7b6c1e2
Create Date: 2026-08-25 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'd3f8a7b6c1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('dishes', sa.Column('created_by', sa.BigInteger(), nullable=True))
    op.add_column(
        'dishes',
        sa.Column(
            'visibility',
            sa.Enum('public', 'team', 'private', name='dish_visibility'),
            nullable=False,
            server_default='public',
        ),
    )
    op.add_column('dishes', sa.Column('team_id', sa.BigInteger(), nullable=True))
    op.create_index('ix_dishes_visibility_team_id', 'dishes', ['visibility', 'team_id'], unique=False)

    op.add_column('recipes', sa.Column('category_id', sa.BigInteger(), nullable=True))
    op.create_index('ix_recipes_category_id', 'recipes', ['category_id'], unique=False)

    # 回填：存量公开菜谱按 dish_id 关联分享分类
    op.execute(
        "UPDATE recipes r JOIN dishes d ON r.dish_id = d.id "
        "SET r.category_id = d.category_id WHERE r.dish_id IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_recipes_category_id', table_name='recipes')
    op.drop_column('recipes', 'category_id')
    op.drop_index('ix_dishes_visibility_team_id', table_name='dishes')
    op.drop_column('dishes', 'team_id')
    op.drop_column('dishes', 'visibility')
    op.drop_column('dishes', 'created_by')