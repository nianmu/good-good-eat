"""add activity_ingredients

Revision ID: d3f8a7b6c1e2
Revises: 99b69f44507d
Create Date: 2026-08-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3f8a7b6c1e2'
down_revision: Union[str, Sequence[str], None] = '99b69f44507d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'activity_ingredients',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('activity_id', sa.BigInteger(), sa.ForeignKey('activities.id'), nullable=False),
        sa.Column('ingredient_name', sa.String(length=64), nullable=False),
        sa.Column('is_ready', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('activity_id', 'ingredient_name', name='uq_activity_ingredient'),
        mysql_charset='utf8mb4',
    )
    op.create_index(op.f('ix_activity_ingredients_activity_id'), 'activity_ingredients', ['activity_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_activity_ingredients_activity_id'), table_name='activity_ingredients')
    op.drop_table('activity_ingredients')
