import uuid

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Person(Base):
    __tablename__ = "people"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

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
    source_type: Mapped[str] = mapped_column(Enum("youtube", "zoom", "upload", name="content_source_type"), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
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
