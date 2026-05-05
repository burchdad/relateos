from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EngagementEventCreate(BaseModel):
    contact_id: UUID | None = None
    organization_id: UUID | None = None
    event_type: str
    source_platform: str | None = None
    raw_payload: dict = Field(default_factory=dict)
    summary: str | None = None
    occurred_at: datetime | None = None


class EngagementEventOut(BaseModel):
    id: UUID
    contact_id: UUID | None
    organization_id: UUID | None
    event_type: str
    source_platform: str | None
    raw_payload: dict
    summary: str | None
    occurred_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class EngagementImportRow(BaseModel):
    name: str | None = None
    email: str | None = None
    event_type: str = "story_view"
    source_platform: str | None = None
    occurred_at: datetime | None = None
    notes: str | None = None


class EngagementImportRequest(BaseModel):
    rows: list[EngagementImportRow]
    auto_create_contacts: bool = True
