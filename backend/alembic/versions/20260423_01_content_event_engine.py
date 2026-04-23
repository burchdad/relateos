"""add content and event engine tables

Revision ID: 20260423_01
Revises: None
Create Date: 2026-04-23 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260423_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    content_source_type = sa.Enum("youtube", "zoom", "upload", name="content_source_type")
    event_type = sa.Enum("weekly", "monthly", "one-time", name="event_type")
    content_source_type.create(op.get_bind(), checkfirst=True)
    event_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "content_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_type", content_source_type, nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "content_insights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("content_items.id"), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("key_points", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "suggested_angles",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("event_type", event_type, nullable=False),
        sa.Column("event_url", sa.Text(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("time_of_day", sa.String(length=50), nullable=False),
        sa.Column("owner_user_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "content_relationship_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("content_items.id"), nullable=False),
        sa.Column("relationship_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("relationships.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("content_relationship_targets")
    op.drop_table("events")
    op.drop_table("content_insights")
    op.drop_table("content_items")

    sa.Enum(name="event_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="content_source_type").drop(op.get_bind(), checkfirst=True)
