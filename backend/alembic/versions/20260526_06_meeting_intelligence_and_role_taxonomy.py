"""add meeting intelligence and role taxonomy fields

Revision ID: 20260526_06
Revises: 20260505_05
Create Date: 2026-05-26 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260526_06"
down_revision: Union[str, None] = "20260505_05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "people", "role_family"):
        op.add_column("people", sa.Column("role_family", sa.String(50), nullable=True))
    if not _has_column(inspector, "people", "market_segment"):
        op.add_column("people", sa.Column("market_segment", sa.String(50), nullable=True))

    if not _has_column(inspector, "meetings", "source_provider"):
        op.add_column("meetings", sa.Column("source_provider", sa.String(50), nullable=True))
    if not _has_column(inspector, "meetings", "external_meeting_id"):
        op.add_column("meetings", sa.Column("external_meeting_id", sa.String(255), nullable=True))
    if not _has_column(inspector, "meetings", "raw_report"):
        op.add_column(
            "meetings",
            sa.Column(
                "raw_report",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )


def downgrade() -> None:
    op.drop_column("meetings", "raw_report")
    op.drop_column("meetings", "external_meeting_id")
    op.drop_column("meetings", "source_provider")
    op.drop_column("people", "market_segment")
    op.drop_column("people", "role_family")
