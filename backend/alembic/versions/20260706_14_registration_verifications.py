"""add registration verification codes

Revision ID: 20260706_14
Revises: 20260706_13
Create Date: 2026-07-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260706_14"
down_revision = "20260706_13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "registration_verifications" in inspector.get_table_names():
        return

    op.create_table(
        "registration_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("challenge_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_registration_verifications_email", "registration_verifications", ["email"])
    op.create_index(
        "ix_registration_verifications_challenge_hash",
        "registration_verifications",
        ["challenge_hash"],
        unique=True,
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "registration_verifications" not in inspector.get_table_names():
        return
    op.drop_index("ix_registration_verifications_challenge_hash", table_name="registration_verifications")
    op.drop_index("ix_registration_verifications_email", table_name="registration_verifications")
    op.drop_table("registration_verifications")
