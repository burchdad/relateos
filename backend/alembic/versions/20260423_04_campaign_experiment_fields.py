"""add experiment fields to content items

Revision ID: 20260423_04
Revises: 20260423_03
Create Date: 2026-04-23 04:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260423_04"
down_revision: Union[str, None] = "20260423_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_columns = {column["name"] for column in inspector.get_columns("content_items")}
    existing_indexes = {index["name"] for index in inspector.get_indexes("content_items")}
    experiment_variant = postgresql.ENUM("control", "optimized", name="campaign_experiment_variant", create_type=False)
    experiment_variant.create(op.get_bind(), checkfirst=True)

    if "experiment_key" not in existing_columns:
        op.add_column("content_items", sa.Column("experiment_key", sa.String(length=100), nullable=True))
    if "experiment_variant" not in existing_columns:
        op.add_column("content_items", sa.Column("experiment_variant", experiment_variant, nullable=True))
    if "ix_content_items_experiment_key" not in existing_indexes:
        op.create_index("ix_content_items_experiment_key", "content_items", ["experiment_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_content_items_experiment_key", table_name="content_items")
    op.drop_column("content_items", "experiment_variant")
    op.drop_column("content_items", "experiment_key")

    experiment_variant = sa.Enum("control", "optimized", name="campaign_experiment_variant")
    experiment_variant.drop(op.get_bind(), checkfirst=True)