"""add public recipe library (dish_id + recipe_favorites)

最终版：公开菜谱库。
- recipes 新增可空 dish_id（平台菜谱与菜单菜品一一对应，供菜品详情跳转公开菜谱）。
- 新增 recipe_favorites 表（用户收藏菜谱，user+recipe 唯一）。

Revision ID: b0f1a2c3d4e5
Revises: a1b2c3d4e5f6
Create Date: 2026-08-22 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b0f1a2c3d4e5'
down_revision: Union[str, Sequence[str], None] = '1eb2a6d1b0dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # recipes.dish_id 可空外键 → dishes.id
    op.add_column('recipes', sa.Column('dish_id', sa.BigInteger(), nullable=True))
    op.create_index(op.f('ix_recipes_dish_id'), 'recipes', ['dish_id'], unique=False)
    op.create_foreign_key('fk_recipes_dish_id', 'recipes', 'dishes', ['dish_id'], ['id'])

    # recipe_favorites 表
    op.create_table('recipe_favorites',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('recipe_id', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['recipe_id'], ['recipes.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'recipe_id', name='uq_recipe_favorite_user_recipe'),
    mysql_charset='utf8mb4'
    )
    op.create_index(op.f('ix_recipe_favorites_recipe_id'), 'recipe_favorites', ['recipe_id'], unique=False)
    op.create_index(op.f('ix_recipe_favorites_user_id'), 'recipe_favorites', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_recipe_favorites_user_id'), table_name='recipe_favorites')
    op.drop_index(op.f('ix_recipe_favorites_recipe_id'), table_name='recipe_favorites')
    op.drop_table('recipe_favorites')
    op.drop_constraint('fk_recipes_dish_id', 'recipes', type_='foreignkey')
    op.drop_index(op.f('ix_recipes_dish_id'), table_name='recipes')
    op.drop_column('recipes', 'dish_id')
