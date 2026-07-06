import uuid

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    org_type: Mapped[str] = mapped_column(
        String(50),
        default="other",
        nullable=False,
    )
    parent_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    owner_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    children: Mapped[list["Organization"]] = relationship("Organization", back_populates="parent")
    parent: Mapped["Organization | None"] = relationship("Organization", back_populates="children", remote_side="Organization.id")
    contacts: Mapped[list["Person"]] = relationship("Person", back_populates="organization")
    deals: Mapped[list["Deal"]] = relationship("Deal", back_populates="organization")


class Person(Base):
    __tablename__ = "people"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    # --- Network Intelligence fields ---
    primary_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role_family: Mapped[str | None] = mapped_column(String(50), nullable=True)
    market_segment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    secondary_roles: Mapped[list] = mapped_column(JSONB, default=list)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    parent_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id"), nullable=True
    )
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    relationship_stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    relationship_strength_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    lifetime_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    referral_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    last_engaged_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_profile_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_quality_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    enrichment_status: Mapped[str | None] = mapped_column(String(50), nullable=True, default="not_started")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization | None"] = relationship("Organization", back_populates="contacts")
    relationships: Mapped[list["Relationship"]] = relationship("Relationship", back_populates="person")


class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    lifecycle_stage: Mapped[str] = mapped_column(String(50), default="new")
    relationship_strength: Mapped[float] = mapped_column(Float, default=0.0)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0)
    last_contacted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_suggested_action_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    person: Mapped[Person] = relationship("Person", back_populates="relationships")
    interactions: Mapped[list["Interaction"]] = relationship("Interaction", back_populates="relationship")
    opportunities: Mapped[list["Opportunity"]] = relationship("Opportunity", back_populates="relationship")
    ai_insights: Mapped[list["AIInsight"]] = relationship("AIInsight", back_populates="relationship")
    signals: Mapped[list["RelationshipSignal"]] = relationship("RelationshipSignal", back_populates="relationship")


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("relationships.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    relationship: Mapped[Relationship] = relationship("Relationship", back_populates="interactions")


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("relationships.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    value_estimate: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="open")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    relationship: Mapped[Relationship] = relationship("Relationship", back_populates="opportunities")


class AIInsight(Base):
    __tablename__ = "ai_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("relationships.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    relationship: Mapped[Relationship] = relationship("Relationship", back_populates="ai_insights")


class RelationshipSignal(Base):
    __tablename__ = "relationship_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    relationship_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("relationships.id"), nullable=False
    )
    signal_key: Mapped[str] = mapped_column(String(80), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False)
    magnitude: Mapped[float] = mapped_column(Float, default=1.0)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    relationship: Mapped[Relationship] = relationship("Relationship", back_populates="signals")


class UserStyleProfile(Base):
    __tablename__ = "user_style_profiles"

    owner_user_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    tone: Mapped[str] = mapped_column(String(50), default="casual")
    length: Mapped[str] = mapped_column(String(50), default="short")
    energy: Mapped[str] = mapped_column(String(50), default="medium")
    emoji_usage: Mapped[str] = mapped_column(String(50), default="low")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(
        Enum(
            "youtube",
            "zoom",
            "skool",
            "facebook",
            "instagram",
            "tiktok",
            "linkedin",
            "podcast",
            "newsletter",
            "website",
            "upload",
            name="content_source_type",
        ),
        nullable=False,
    )
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    experiment_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    experiment_variant: Mapped[str | None] = mapped_column(
        Enum("control", "optimized", name="campaign_experiment_variant"),
        nullable=True,
    )
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    insights: Mapped[list["ContentInsight"]] = relationship("ContentInsight", back_populates="content", cascade="all, delete-orphan")
    targets: Mapped[list["ContentRelationshipTarget"]] = relationship(
        "ContentRelationshipTarget", back_populates="content", cascade="all, delete-orphan"
    )


class ContentInsight(Base):
    __tablename__ = "content_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_items.id"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    key_points: Mapped[list[str]] = mapped_column(JSONB, default=list)
    suggested_angles: Mapped[list[str]] = mapped_column(JSONB, default=list)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    content: Mapped[ContentItem] = relationship("ContentItem", back_populates="insights")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Enum("weekly", "monthly", "one-time", name="event_type"), nullable=False)
    event_url: Mapped[str] = mapped_column(Text, nullable=False)
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_of_day: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ContentRelationshipTarget(Base):
    __tablename__ = "content_relationship_targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_items.id"), nullable=False)
    relationship_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("relationships.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    engagement_status: Mapped[str] = mapped_column(
        Enum("pending", "sent", "responded", "ignored", name="content_engagement_status"),
        default="pending",
        nullable=False,
    )
    delivery_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_sent_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_engagement_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    content: Mapped[ContentItem] = relationship("ContentItem", back_populates="targets")
    relationship: Mapped[Relationship] = relationship("Relationship")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    relationship_focus: Mapped[str | None] = mapped_column(String(100), nullable=True)
    primary_goal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wants_calendar_connection: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    wants_contact_import: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ConnectorCredential(Base):
    __tablename__ = "connector_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    connector_key: Mapped[str] = mapped_column(String(80), nullable=False)
    values: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app_users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ============================================================
# Network Intelligence Models (Phase 1)
# ============================================================

class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deal_type: Mapped[str] = mapped_column(String(50), default="other", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="lead", nullable=False)
    primary_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id"), nullable=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    source_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id"), nullable=True
    )
    referred_by_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id"), nullable=True
    )
    amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    expected_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    actual_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    probability: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    close_date: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization | None"] = relationship("Organization", back_populates="deals")
    primary_contact: Mapped["Person | None"] = relationship("Person", foreign_keys=[primary_contact_id])
    participants: Mapped[list["DealParticipant"]] = relationship("DealParticipant", back_populates="deal", cascade="all, delete-orphan")


class DealParticipant(Base):
    __tablename__ = "deal_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deals.id"), nullable=False)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="other", nullable=False)
    split_percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    split_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    referral_fee: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    deal: Mapped["Deal"] = relationship("Deal", back_populates="participants")
    contact: Mapped["Person | None"] = relationship("Person", foreign_keys=[contact_id])


class RelationshipEdge(Base):
    __tablename__ = "relationship_edges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    target_contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    relationship_type: Mapped[str] = mapped_column(String(50), default="knows", nullable=False)
    strength: Mapped[float] = mapped_column(Float, default=1.0, nullable=False, server_default="1")
    revenue_attributed: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, server_default="0")
    deal_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    last_interaction_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    source_contact: Mapped["Person"] = relationship("Person", foreign_keys=[source_contact_id])
    target_contact: Mapped["Person"] = relationship("Person", foreign_keys=[target_contact_id])


class EngagementEvent(Base):
    __tablename__ = "engagement_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_platform: Mapped[str | None] = mapped_column(String(50), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    contact: Mapped["Person | None"] = relationship("Person", foreign_keys=[contact_id])


class ContentAsset(Base):
    __tablename__ = "content_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), default="post", nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_angles: Mapped[dict] = mapped_column(JSONB, default=dict)
    target_audience: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    funnel_campaigns: Mapped[list["FunnelCampaign"]] = relationship("FunnelCampaign", back_populates="content_asset")


class FunnelCampaign(Base):
    __tablename__ = "funnel_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    campaign_type: Mapped[str] = mapped_column(String(50), default="other", nullable=False)
    content_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_assets.id"), nullable=True
    )
    target_segment: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    content_asset: Mapped["ContentAsset | None"] = relationship("ContentAsset", back_populates="funnel_campaigns")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(50), nullable=True)
    meeting_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[list] = mapped_column(JSONB, default=list)
    source_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_meeting_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_report: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    attendees: Mapped[list["MeetingAttendee"]] = relationship("MeetingAttendee", back_populates="meeting", cascade="all, delete-orphan")
    recording_artifacts: Mapped[list["RecordingArtifact"]] = relationship(
        "RecordingArtifact", back_populates="meeting", cascade="all, delete-orphan"
    )


class MeetingAttendee(Base):
    __tablename__ = "meeting_attendees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_status: Mapped[str] = mapped_column(String(50), default="unknown", nullable=False)
    joined_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    left_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    followup_status: Mapped[str] = mapped_column(String(50), default="not_started", nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="attendees")
    contact: Mapped["Person | None"] = relationship("Person", foreign_keys=[contact_id])


class RecordingArtifact(Base):
    __tablename__ = "recording_artifacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(50), default="ready", nullable=False)
    extraction_notes: Mapped[list] = mapped_column(JSONB, default=list)
    raw_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="recording_artifacts")
