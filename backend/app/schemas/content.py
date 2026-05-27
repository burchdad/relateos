from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


ContentSourceType = Literal[
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
]


class ContentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=3)
    source_type: ContentSourceType
    source_url: str = Field(min_length=4)
    thumbnail_url: str | None = None
    owner_user_id: str | None = None
    experiment_key: str | None = Field(default=None, min_length=3, max_length=100)
    experiment_variant: Literal["control", "optimized"] | None = None


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
    experiment_key: str | None = None
    experiment_variant: Literal["control", "optimized"] | None = None
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
    experiment_key: str | None = None
    experiment_variant: Literal["control", "optimized"] | None = None
    sent_count: int
    responded_count: int
    ignored_count: int
    pending_count: int


class SkoolAgentCapability(BaseModel):
    key: str
    label: str
    status: Literal["ready", "needs_connector", "planned"]
    detail: str


class SkoolAgentStatus(BaseModel):
    community_url: str
    classroom_url: str
    schedule_label: str
    timezone: str
    status: Literal["ready", "needs_connector", "queued"]
    last_sync_mode: str | None = None
    last_sync_at: datetime | None = None
    next_session_label: str
    capabilities: list[SkoolAgentCapability]
    next_steps: list[str]


class SkoolAgentSyncRequest(BaseModel):
    community_url: str = "https://www.skool.com/ourdealpartner"
    classroom_url: str = "https://www.skool.com/ourdealpartner/classroom"
    mode: Literal["archive", "live_session", "full"] = "full"
    auto_create_content: bool = True
    auto_create_meetings: bool = True
    auto_generate_followups: bool = True


class SkoolAgentSyncResponse(SkoolAgentStatus):
    job_id: str
    requested_mode: Literal["archive", "live_session", "full"]
    created_content_count: int = 0
    created_meeting_count: int = 0
    discovered_session_count: int = 0
    message: str
