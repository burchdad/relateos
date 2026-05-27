"""expand content source types

Revision ID: 20260527_07
Revises: 20260526_06
Create Date: 2026-05-27 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260527_07"
down_revision: Union[str, None] = "20260526_06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_SOURCE_TYPES = [
    "skool",
    "facebook",
    "instagram",
    "tiktok",
    "linkedin",
    "podcast",
    "newsletter",
    "website",
]


def upgrade() -> None:
    for source_type in NEW_SOURCE_TYPES:
        op.execute(f"ALTER TYPE content_source_type ADD VALUE IF NOT EXISTS '{source_type}'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without recreating the type.
    pass
