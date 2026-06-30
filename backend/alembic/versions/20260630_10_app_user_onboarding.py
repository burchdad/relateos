"""add app user onboarding profile

Revision ID: 20260630_10
Revises: 20260630_09
Create Date: 2026-06-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260630_10"
down_revision = "20260630_09"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector, table_name: str, column: sa.Column) -> None:
    existing = {item["name"] for item in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "app_users" not in inspector.get_table_names():
        return

    _add_column_if_missing(inspector, "app_users", sa.Column("company_name", sa.String(length=255), nullable=True))
    _add_column_if_missing(inspector, "app_users", sa.Column("role_title", sa.String(length=255), nullable=True))
    _add_column_if_missing(inspector, "app_users", sa.Column("relationship_focus", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "app_users", sa.Column("primary_goal", sa.String(length=100), nullable=True))
    _add_column_if_missing(inspector, "app_users", sa.Column("timezone", sa.String(length=100), nullable=True))
    _add_column_if_missing(
        inspector,
        "app_users",
        sa.Column("wants_calendar_connection", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    _add_column_if_missing(
        inspector,
        "app_users",
        sa.Column("wants_contact_import", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    _add_column_if_missing(
        inspector,
        "app_users",
        sa.Column("onboarding_complete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    for column_name in [
        "onboarding_complete",
        "wants_contact_import",
        "wants_calendar_connection",
        "timezone",
        "primary_goal",
        "relationship_focus",
        "role_title",
        "company_name",
    ]:
        op.drop_column("app_users", column_name)
