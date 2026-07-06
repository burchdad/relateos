"""add app user two factor authentication

Revision ID: 20260706_13
Revises: 20260630_12
Create Date: 2026-07-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_13"
down_revision = "20260630_12"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "app_users" not in inspector.get_table_names():
        return

    if not _has_column(inspector, "app_users", "two_factor_enabled"):
        op.add_column(
            "app_users",
            sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    if not _has_column(inspector, "app_users", "two_factor_secret"):
        op.add_column("app_users", sa.Column("two_factor_secret", sa.Text(), nullable=True))
    if not _has_column(inspector, "app_users", "two_factor_pending_secret"):
        op.add_column("app_users", sa.Column("two_factor_pending_secret", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "app_users" not in inspector.get_table_names():
        return
    for column_name in ["two_factor_pending_secret", "two_factor_secret", "two_factor_enabled"]:
        if _has_column(inspector, "app_users", column_name):
            op.drop_column("app_users", column_name)
