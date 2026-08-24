"""add activities

Revision ID: 99b69f44507d
Revises: b0f1a2c3d4e5
Create Date: 2026-08-24 17:33:40.339735

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99b69f44507d'
down_revision: Union[str, Sequence[str], None] = 'b0f1a2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # teams.description
    op.add_column('teams', sa.Column('description', sa.Text(), nullable=True))

    # activities
    op.create_table(
        'activities',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('team_id', sa.BigInteger(), sa.ForeignKey('teams.id'), nullable=False),
        sa.Column('type', sa.Enum('daily', 'party', name='activity_type'), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('status', sa.Enum('ordering', 'preparing', 'cooking', 'completed', name='activity_status'), nullable=False, server_default='ordering'),
        sa.Column('people', sa.Integer(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        mysql_charset='utf8mb4',
    )
    op.create_index(op.f('ix_activities_team_id'), 'activities', ['team_id'], unique=False)
    op.create_index(op.f('ix_activities_status'), 'activities', ['status'], unique=False)
    op.create_index(op.f('ix_activities_created_by'), 'activities', ['created_by'], unique=False)

    # activity_items
    op.create_table(
        'activity_items',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('activity_id', sa.BigInteger(), sa.ForeignKey('activities.id'), nullable=False),
        sa.Column('dish_id', sa.BigInteger(), sa.ForeignKey('dishes.id'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('added_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('chef_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('status', sa.Enum('pending', 'prepared', 'cooking', 'done', name='item_status'), nullable=False, server_default='pending'),
        sa.Column('added_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('activity_id', 'dish_id', 'added_by', name='uq_activity_item'),
        mysql_charset='utf8mb4',
    )
    op.create_index(op.f('ix_activity_items_activity_id'), 'activity_items', ['activity_id'], unique=False)
    op.create_index(op.f('ix_activity_items_dish_id'), 'activity_items', ['dish_id'], unique=False)
    op.create_index(op.f('ix_activity_items_added_by'), 'activity_items', ['added_by'], unique=False)
    op.create_index(op.f('ix_activity_items_chef_id'), 'activity_items', ['chef_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('activity_items')
    op.drop_table('activities')
    op.drop_column('teams', 'description')
