"""add core relationship schema

Revision ID: 20260422_00
Revises: None
Create Date: 2026-04-22 23:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260422_00"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "people"):
        op.create_table(
            "people",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("first_name", sa.String(length=100), nullable=False),
            sa.Column("last_name", sa.String(length=100), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("phone", sa.String(length=50), nullable=True),
            sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "relationships"):
        op.create_table(
            "relationships",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=False),
            sa.Column("type", sa.String(length=50), nullable=False),
            sa.Column("lifecycle_stage", sa.String(length=50), nullable=False, server_default="new"),
            sa.Column("relationship_strength", sa.Float(), nullable=False, server_default="0"),
            sa.Column("priority_score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("last_contacted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_suggested_action_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("owner_user_id", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "interactions"):
        op.create_table(
            "interactions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("relationship_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("relationships.id"), nullable=False),
            sa.Column("type", sa.String(length=30), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("sentiment", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "opportunities"):
        op.create_table(
            "opportunities",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("relationship_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("relationships.id"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("value_estimate", sa.Float(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has_table(inspector, "ai_insights"):
        op.create_table(
            "ai_insights",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("relationship_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("relationships.id"), nullable=False),
            sa.Column("type", sa.String(length=50), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "relationship_signals"):
        op.create_table(
            "relationship_signals",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("relationship_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("relationships.id"), nullable=False),
            sa.Column("signal_key", sa.String(length=80), nullable=False),
            sa.Column("weight", sa.Float(), nullable=False),
            sa.Column("magnitude", sa.Float(), nullable=False, server_default="1"),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "user_style_profiles"):
        op.create_table(
            "user_style_profiles",
            sa.Column("owner_user_id", sa.String(length=100), primary_key=True, nullable=False),
            sa.Column("tone", sa.String(length=50), nullable=False, server_default="casual"),
            sa.Column("length", sa.String(length=50), nullable=False, server_default="short"),
            sa.Column("energy", sa.String(length=50), nullable=False, server_default="medium"),
            sa.Column("emoji_usage", sa.String(length=50), nullable=False, server_default="low"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("user_style_profiles")
    op.drop_table("relationship_signals")
    op.drop_table("ai_insights")
    op.drop_table("opportunities")
    op.drop_table("interactions")
    op.drop_table("relationships")
    op.drop_table("people")