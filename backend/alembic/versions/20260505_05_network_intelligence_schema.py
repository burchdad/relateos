"""add network intelligence schema

Revision ID: 20260505_05
Revises: 20260423_04
Create Date: 2026-05-05 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260505_05"
down_revision: Union[str, None] = "20260423_04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _has_table(inspector, table_name):
        return False
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ------------------------------------------------------------------
    # organizations
    # ------------------------------------------------------------------
    if not _has_table(inspector, "organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("org_type", sa.String(50), nullable=False, server_default="other"),
            sa.Column("parent_organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("owner_user_id", sa.String(100), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("website", sa.String(255), nullable=True),
            sa.Column("location", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # people — new network intelligence columns
    # ------------------------------------------------------------------
    new_people_cols = [
        ("organization_id", sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True)),
        ("parent_contact_id", sa.Column("parent_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True)),
        ("primary_role", sa.Column("primary_role", sa.String(50), nullable=True)),
        ("secondary_roles", sa.Column("secondary_roles", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb"))),
        ("source", sa.Column("source", sa.String(50), nullable=True)),
        ("relationship_stage", sa.Column("relationship_stage", sa.String(50), nullable=True)),
        ("relationship_strength_score", sa.Column("relationship_strength_score", sa.Float(), nullable=False, server_default="0")),
        ("lifetime_value", sa.Column("lifetime_value", sa.Float(), nullable=False, server_default="0")),
        ("referral_value", sa.Column("referral_value", sa.Float(), nullable=False, server_default="0")),
        ("last_engaged_at", sa.Column("last_engaged_at", sa.DateTime(timezone=True), nullable=True)),
        ("notes_summary", sa.Column("notes_summary", sa.Text(), nullable=True)),
        ("ai_profile_summary", sa.Column("ai_profile_summary", sa.Text(), nullable=True)),
        ("data_quality_score", sa.Column("data_quality_score", sa.Float(), nullable=False, server_default="0")),
        ("enrichment_status", sa.Column("enrichment_status", sa.String(50), nullable=True, server_default="not_started")),
    ]
    for col_name, col_def in new_people_cols:
        if not _has_column(inspector, "people", col_name):
            op.add_column("people", col_def)

    # ------------------------------------------------------------------
    # deals
    # ------------------------------------------------------------------
    if not _has_table(inspector, "deals"):
        op.create_table(
            "deals",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("deal_type", sa.String(50), nullable=False, server_default="other"),
            sa.Column("status", sa.String(50), nullable=False, server_default="lead"),
            sa.Column("primary_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("source_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("referred_by_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("expected_value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("actual_value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("probability", sa.Float(), nullable=False, server_default="0"),
            sa.Column("close_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # deal_participants
    # ------------------------------------------------------------------
    if not _has_table(inspector, "deal_participants"):
        op.create_table(
            "deal_participants",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("deal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("deals.id"), nullable=False),
            sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("role", sa.String(50), nullable=False, server_default="other"),
            sa.Column("split_percentage", sa.Float(), nullable=False, server_default="0"),
            sa.Column("split_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("referral_fee", sa.Float(), nullable=False, server_default="0"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # relationship_edges
    # ------------------------------------------------------------------
    if not _has_table(inspector, "relationship_edges"):
        op.create_table(
            "relationship_edges",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("source_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=False),
            sa.Column("target_contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("relationship_type", sa.String(50), nullable=False, server_default="knows"),
            sa.Column("strength", sa.Float(), nullable=False, server_default="1"),
            sa.Column("revenue_attributed", sa.Float(), nullable=False, server_default="0"),
            sa.Column("deal_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_interaction_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # engagement_events
    # ------------------------------------------------------------------
    if not _has_table(inspector, "engagement_events"):
        op.create_table(
            "engagement_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("source_platform", sa.String(50), nullable=True),
            sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # content_assets
    # ------------------------------------------------------------------
    if not _has_table(inspector, "content_assets"):
        op.create_table(
            "content_assets",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("content_type", sa.String(50), nullable=False, server_default="post"),
            sa.Column("source_url", sa.Text(), nullable=True),
            sa.Column("transcript", sa.Text(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("ai_angles", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("target_audience", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # funnel_campaigns
    # ------------------------------------------------------------------
    if not _has_table(inspector, "funnel_campaigns"):
        op.create_table(
            "funnel_campaigns",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("campaign_type", sa.String(50), nullable=False, server_default="other"),
            sa.Column("content_asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("content_assets.id"), nullable=True),
            sa.Column("target_segment", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
            sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # meetings
    # ------------------------------------------------------------------
    if not _has_table(inspector, "meetings"):
        op.create_table(
            "meetings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("platform", sa.String(50), nullable=True),
            sa.Column("meeting_url", sa.Text(), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("transcript", sa.Text(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("action_items", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("source_event_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # ------------------------------------------------------------------
    # meeting_attendees
    # ------------------------------------------------------------------
    if not _has_table(inspector, "meeting_attendees"):
        op.create_table(
            "meeting_attendees",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meetings.id"), nullable=False),
            sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("people.id"), nullable=True),
            sa.Column("name", sa.String(255), nullable=True),
            sa.Column("email", sa.String(255), nullable=True),
            sa.Column("attendance_status", sa.String(50), nullable=False, server_default="unknown"),
            sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("followup_status", sa.String(50), nullable=False, server_default="not_started"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("meeting_attendees")
    op.drop_table("meetings")
    op.drop_table("funnel_campaigns")
    op.drop_table("content_assets")
    op.drop_table("engagement_events")
    op.drop_table("relationship_edges")
    op.drop_table("deal_participants")
    op.drop_table("deals")
    op.drop_table("organizations")
