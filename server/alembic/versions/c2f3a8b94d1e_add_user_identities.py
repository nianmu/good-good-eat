"""add user_identities table, backfill openid, drop users.openid

Revision ID: c2f3a8b94d1e
Revises: a1b2c3d4e5f6
Create Date: 2026-08-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2f3a8b94d1e'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """账号与身份解耦：微信 openid 搬迁进 user_identities，users.openid 退役。"""
    op.create_table(
        'user_identities',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('provider', sa.String(length=16), nullable=False),
        sa.Column('provider_uid', sa.String(length=128), nullable=False),
        sa.Column('credential', sa.String(length=255), nullable=True),
        sa.Column('extra_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider', 'provider_uid', name='uq_user_identity_provider_uid'),
        mysql_charset='utf8mb4',
    )
    op.create_index(op.f('ix_user_identities_user_id'), 'user_identities', ['user_id'], unique=False)

    # 回填原先存在 users.openid 的微信身份到 user_identities（openid 原为唯一，无重复）
    op.execute(
        "INSERT INTO user_identities (user_id, provider, provider_uid, created_at, updated_at) "
        "SELECT id, 'wechat', openid, NOW(), NOW() FROM users WHERE openid IS NOT NULL"
    )
    op.drop_column('users', 'openid')


def downgrade() -> None:
    """恢复 openid 列并回写微信身份（best-effort，供回滚）。"""
    op.add_column('users', sa.Column('openid', sa.String(length=64), nullable=True))
    op.execute(
        "UPDATE users SET openid = ("
        "SELECT provider_uid FROM user_identities WHERE provider='wechat' AND user_id = users.id LIMIT 1"
        ") WHERE EXISTS (SELECT 1 FROM user_identities WHERE provider='wechat' AND user_id = users.id)"
    )
    op.drop_index(op.f('ix_user_identities_user_id'), table_name='user_identities')
    op.drop_table('user_identities')