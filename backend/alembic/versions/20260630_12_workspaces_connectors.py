"""add workspace scoped connector credentials

Revision ID: 20260630_12
Revises: 20260630_11
Create Date: 2026-06-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260630_12"
down_revision = "20260630_11"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "workspaces" not in inspector.get_table_names():
        op.create_table(
            "workspaces",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "app_users" in inspector.get_table_names() and not _has_column(inspector, "app_users", "workspace_id"):
        op.add_column("app_users", sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key("fk_app_users_workspace_id", "app_users", "workspaces", ["workspace_id"], ["id"])

    if "connector_credentials" not in inspector.get_table_names():
        op.create_table(
            "connector_credentials",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("connector_key", sa.String(length=80), nullable=False),
            sa.Column("values", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        )
        op.create_index(
            "ix_connector_credentials_workspace_connector",
            "connector_credentials",
            ["workspace_id", "connector_key"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_connector_credentials_workspace_connector", table_name="connector_credentials")
    op.drop_table("connector_credentials")
    op.drop_constraint("fk_app_users_workspace_id", "app_users", type_="foreignkey")
    op.drop_column("app_users", "workspace_id")
    op.drop_table("workspaces")
