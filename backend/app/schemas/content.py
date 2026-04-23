from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ContentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=3)
    source_type: Literal["youtube", "zoom", "upload"]
    source_url: str = Field(min_length=4)
    thumbnail_url: str | None = None
    owner_user_id: str | None = None


class ContentInsightOut(BaseModel):
    id: UUID
    content_id: UUID
    summary: str
    key_points: list[str]
    suggested_angles: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ContentItemOut(BaseModel):
    id: UUID
    title: str
    description: str
    source_type: str
    source_url: str
    thumbnail_url: str | None
    owner_user_id: str | None
    created_at: datetime
    latest_insight: ContentInsightOut | None = None

    model_config = {"from_attributes": True}


class ContentSummaryResponse(BaseModel):
    summary: str
    key_points: list[str]
    suggested_angles: list[str]


class ContentTargetOut(BaseModel):
    relationship_id: UUID
    name: str
    reason: str
    engagement_status: Literal["pending", "sent", "responded", "ignored"] = "pending"
    delivery_count: int = 0
    last_sent_at: datetime | None = None
    last_engagement_at: datetime | None = None


class FollowUpStep(BaseModel):
    day_offset: int
    label: str
    suggested_message: str
    targets: list[ContentTargetOut]


class FollowUpResponse(BaseModel):
    content_id: UUID
    steps: list[FollowUpStep]


class FollowUpExecuteRequest(BaseModel):
    day_offset: int
    relationship_ids: list[UUID] = Field(default_factory=list)
    dispatch_mode: Literal["immediate", "queued"] = "immediate"
    delay_window_minutes: int = Field(default=0, ge=0, le=120)


class FollowUpExecuteResponse(BaseModel):
    content_id: UUID
    day_offset: int
    executed_count: int
    queued_count: int = 0
    dispatch_mode: Literal["immediate", "queued"] = "immediate"
    relationship_ids: list[UUID]


class ContentEngagementUpdateRequest(BaseModel):
    relationship_id: UUID
    status: Literal["responded", "ignored"]


class ContentCampaignStats(BaseModel):
    content_id: UUID
    title: str
    sent_count: int
    responded_count: int
    ignored_count: int
    pending_count: int
