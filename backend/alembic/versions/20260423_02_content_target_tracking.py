"""add content target tracking fields

Revision ID: 20260423_02
Revises: 20260423_01
Create Date: 2026-04-23 00:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260423_02"
down_revision: Union[str, None] = "20260423_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_columns = {column["name"] for column in inspector.get_columns("content_relationship_targets")}
    engagement_status_enum = postgresql.ENUM(
        "pending",
        "sent",
        "responded",
        "ignored",
        name="content_engagement_status",
        create_type=False,
    )
    engagement_status_enum.create(op.get_bind(), checkfirst=True)

    if "engagement_status" not in existing_columns:
        op.add_column(
            "content_relationship_targets",
            sa.Column("engagement_status", engagement_status_enum, nullable=False, server_default="pending"),
        )
    if "delivery_count" not in existing_columns:
        op.add_column(
            "content_relationship_targets",
            sa.Column("delivery_count", sa.Integer(), nullable=False, server_default="0"),
        )
    if "last_sent_at" not in existing_columns:
        op.add_column(
            "content_relationship_targets",
            sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "last_engagement_at" not in existing_columns:
        op.add_column(
            "content_relationship_targets",
            sa.Column("last_engagement_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("content_relationship_targets", "last_engagement_at")
    op.drop_column("content_relationship_targets", "last_sent_at")
    op.drop_column("content_relationship_targets", "delivery_count")
    op.drop_column("content_relationship_targets", "engagement_status")

    sa.Enum(name="content_engagement_status").drop(op.get_bind(), checkfirst=True)
