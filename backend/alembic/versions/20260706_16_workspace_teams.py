"""add workspace teams and invites

Revision ID: 20260706_16
Revises: 20260706_15
Create Date: 2026-07-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260706_16"
down_revision = "20260706_15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    if "workspace_memberships" not in inspector.get_table_names():
        op.create_table(
            "workspace_memberships",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("role", sa.String(length=40), nullable=False, server_default="member"),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="active"),
            sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("invited_email", sa.String(length=255), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["invited_by_user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_memberships_workspace_user"),
        )
        op.create_index("ix_workspace_memberships_workspace_id", "workspace_memberships", ["workspace_id"])
        op.create_index("ix_workspace_memberships_user_id", "workspace_memberships", ["user_id"])

    if "workspace_invites" not in inspector.get_table_names():
        op.create_table(
            "workspace_invites",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("invited_email", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=40), nullable=False, server_default="member"),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
            sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("accepted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["accepted_by_user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["invited_by_user_id"], ["app_users.id"]),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_workspace_invites_workspace_id", "workspace_invites", ["workspace_id"])
        op.create_index("ix_workspace_invites_invited_email", "workspace_invites", ["invited_email"])
        op.create_index("ix_workspace_invites_token_hash", "workspace_invites", ["token_hash"], unique=True)

    op.execute(
        """
        INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, accepted_at, created_at, updated_at)
        SELECT gen_random_uuid(), u.workspace_id, u.id,
               CASE WHEN w.owner_user_id = u.id THEN 'owner' ELSE 'admin' END,
               'active', now(), now(), now()
        FROM app_users u
        LEFT JOIN workspaces w ON w.id = u.workspace_id
        WHERE u.workspace_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_workspace_memberships_workspace_user DO NOTHING
        """
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "workspace_invites" in inspector.get_table_names():
        op.drop_index("ix_workspace_invites_token_hash", table_name="workspace_invites")
        op.drop_index("ix_workspace_invites_invited_email", table_name="workspace_invites")
        op.drop_index("ix_workspace_invites_workspace_id", table_name="workspace_invites")
        op.drop_table("workspace_invites")
    if "workspace_memberships" in inspector.get_table_names():
        op.drop_index("ix_workspace_memberships_user_id", table_name="workspace_memberships")
        op.drop_index("ix_workspace_memberships_workspace_id", table_name="workspace_memberships")
        op.drop_table("workspace_memberships")
