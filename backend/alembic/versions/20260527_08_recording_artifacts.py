"""add recording artifacts

Revision ID: 20260527_08
Revises: 20260527_07
Create Date: 2026-05-27 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260527_08"
down_revision: Union[str, None] = "20260527_07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("recording_artifacts"):
        return

    op.create_table(
        "recording_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("artifact_type", sa.String(length=50), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=50), server_default="ready", nullable=False),
        sa.Column("extraction_notes", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("raw_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recording_artifacts_meeting_id", "recording_artifacts", ["meeting_id"])
    op.create_index("ix_recording_artifacts_type_status", "recording_artifacts", ["artifact_type", "status"])


def downgrade() -> None:
    op.drop_index("ix_recording_artifacts_type_status", table_name="recording_artifacts")
    op.drop_index("ix_recording_artifacts_meeting_id", table_name="recording_artifacts")
    op.drop_table("recording_artifacts")
