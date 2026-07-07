"""add follow up tasks

Revision ID: 20260706_17
Revises: 20260706_16
Create Date: 2026-07-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260706_17"
down_revision = "20260706_16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "follow_up_tasks" not in inspector.get_table_names():
        op.create_table(
            "follow_up_tasks",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("relationship_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("suggested_message", sa.Text(), nullable=True),
            sa.Column("task_type", sa.String(length=50), nullable=False, server_default="follow_up"),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="open"),
            sa.Column("priority", sa.String(length=50), nullable=False, server_default="normal"),
            sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["assigned_to_user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["contact_id"], ["people.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"]),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_follow_up_tasks_workspace_id", "follow_up_tasks", ["workspace_id"])
        op.create_index("ix_follow_up_tasks_relationship_id", "follow_up_tasks", ["relationship_id"])
        op.create_index("ix_follow_up_tasks_contact_id", "follow_up_tasks", ["contact_id"])
        op.create_index("ix_follow_up_tasks_status_due", "follow_up_tasks", ["workspace_id", "status", "due_at"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "follow_up_tasks" in inspector.get_table_names():
        op.drop_index("ix_follow_up_tasks_status_due", table_name="follow_up_tasks")
        op.drop_index("ix_follow_up_tasks_contact_id", table_name="follow_up_tasks")
        op.drop_index("ix_follow_up_tasks_relationship_id", table_name="follow_up_tasks")
        op.drop_index("ix_follow_up_tasks_workspace_id", table_name="follow_up_tasks")
        op.drop_table("follow_up_tasks")
