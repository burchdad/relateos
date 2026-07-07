"""add calendar sync fields to events

Revision ID: 20260707_20
Revises: 20260707_19
Create Date: 2026-07-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_20"
down_revision = "20260707_19"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "events" not in inspector.get_table_names():
        return

    columns = {
        "calendar_start_date": sa.Column("calendar_start_date", sa.Date(), nullable=True),
        "calendar_event_id": sa.Column("calendar_event_id", sa.String(length=255), nullable=True),
        "calendar_event_url": sa.Column("calendar_event_url", sa.Text(), nullable=True),
        "calendar_sync_status": sa.Column("calendar_sync_status", sa.String(length=50), nullable=True),
        "calendar_sync_error": sa.Column("calendar_sync_error", sa.Text(), nullable=True),
    }
    for name, column in columns.items():
        if not _has_column(inspector, "events", name):
            op.add_column("events", column)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "events" not in inspector.get_table_names():
        return

    for name in (
        "calendar_sync_error",
        "calendar_sync_status",
        "calendar_event_url",
        "calendar_event_id",
        "calendar_start_date",
    ):
        if _has_column(inspector, "events", name):
            op.drop_column("events", name)
