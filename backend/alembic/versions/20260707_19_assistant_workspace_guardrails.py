"""add assistant logs and workspace scope gaps

Revision ID: 20260707_19
Revises: 20260707_18
Create Date: 2026-07-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260707_19"
down_revision = "20260707_18"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name in ("content_items", "deals"):
        if table_name in inspector.get_table_names() and not _has_column(inspector, table_name, "workspace_id"):
            op.add_column(table_name, sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True))
            op.create_index(f"ix_{table_name}_workspace_id", table_name, ["workspace_id"])
            op.create_foreign_key(
                f"fk_{table_name}_workspace_id",
                table_name,
                "workspaces",
                ["workspace_id"],
                ["id"],
            )

    if "assistant_action_logs" not in inspector.get_table_names():
        op.create_table(
            "assistant_action_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app_users.id"), nullable=True),
            sa.Column("action_type", sa.String(length=80), nullable=False),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="completed"),
            sa.Column("prompt", sa.Text(), nullable=True),
            sa.Column("target_type", sa.String(length=80), nullable=True),
            sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_assistant_action_logs_workspace_id", "assistant_action_logs", ["workspace_id"])
        op.create_index("ix_assistant_action_logs_user_id", "assistant_action_logs", ["user_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "assistant_action_logs" in inspector.get_table_names():
        op.drop_index("ix_assistant_action_logs_user_id", table_name="assistant_action_logs")
        op.drop_index("ix_assistant_action_logs_workspace_id", table_name="assistant_action_logs")
        op.drop_table("assistant_action_logs")

    for table_name in ("deals", "content_items"):
        if table_name in inspector.get_table_names() and _has_column(inspector, table_name, "workspace_id"):
            op.drop_constraint(f"fk_{table_name}_workspace_id", table_name, type_="foreignkey")
            op.drop_index(f"ix_{table_name}_workspace_id", table_name=table_name)
            op.drop_column(table_name, "workspace_id")
