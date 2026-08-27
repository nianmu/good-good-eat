"""basket_items 增加 (user_id, name) 唯一约束，防止并发 upsert 产生重复行。

Revision ID: a7c3d9e2f1b8
Revises: f0a1b2c3d4e5
Create Date: 2026-08-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c3d9e2f1b8"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 先清理历史重复行（保留每组 user_id+name 中 id 最小的一条）。
    # 注意：内层必须用 MIN(id) 聚合，否则在 only_full_group_by 下报 1055；
    # 双层派生表规避 MySQL 1093（不能直接更新 FROM 中的目标表）。
    op.execute(
        """
        DELETE FROM basket_items
        WHERE id NOT IN (
            SELECT keep.id FROM (
                SELECT MIN(id) AS id FROM basket_items GROUP BY user_id, name
            ) AS keep
        )
        """
    )
    op.create_unique_constraint("uq_basket_user_name", "basket_items", ["user_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_basket_user_name", "basket_items", type_="unique")
