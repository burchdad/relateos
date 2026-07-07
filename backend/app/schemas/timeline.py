from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TimelineItem(BaseModel):
    id: str
    source: str
    type: str
    title: str
    body: str | None = None
    occurred_at: datetime
    metadata: dict = Field(default_factory=dict)


class TimelineCreate(BaseModel):
    type: str = "note"
    content: str = Field(min_length=1, max_length=5000)
    summary: str | None = None
    sentiment: float | None = None


class FollowUpQueueItem(BaseModel):
    relationship_id: UUID
    contact_id: UUID | None
    name: str
    priority_score: float
    urgency_level: str
    reason_tag: str
    why_now: str
    suggested_message: str | None
    last_contacted_at: datetime | None
    days_since_contact: int | None
    signal_reasons: list[str]
