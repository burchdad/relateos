"""add workspace scope to crm tables

Revision ID: 20260706_15
Revises: 20260706_14
Create Date: 2026-07-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260706_15"
down_revision = "20260706_14"
branch_labels = None
depends_on = None


SCOPED_TABLES = [
    "organizations",
    "people",
    "relationships",
    "events",
    "relationship_edges",
    "engagement_events",
    "meetings",
]


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name in SCOPED_TABLES:
        if table_name not in inspector.get_table_names() or _has_column(inspector, table_name, "workspace_id"):
            continue
        op.add_column(table_name, sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(f"ix_{table_name}_workspace_id", table_name, ["workspace_id"])
        op.create_foreign_key(
            f"fk_{table_name}_workspace_id",
            table_name,
            "workspaces",
            ["workspace_id"],
            ["id"],
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table_name in reversed(SCOPED_TABLES):
        if table_name not in inspector.get_table_names() or not _has_column(inspector, table_name, "workspace_id"):
            continue
        op.drop_constraint(f"fk_{table_name}_workspace_id", table_name, type_="foreignkey")
        op.drop_index(f"ix_{table_name}_workspace_id", table_name=table_name)
        op.drop_column(table_name, "workspace_id")
