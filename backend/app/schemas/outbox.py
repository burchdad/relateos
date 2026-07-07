from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OutboxMessageCreate(BaseModel):
    task_id: UUID | None = None
    relationship_id: UUID | None = None
    contact_id: UUID | None = None
    to_email: str | None = Field(default=None, max_length=255)
    to_name: str | None = Field(default=None, max_length=255)
    subject: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    status: str = "draft"
    metadata_json: dict = Field(default_factory=dict)


class OutboxMessageUpdate(BaseModel):
    to_email: str | None = Field(default=None, max_length=255)
    to_name: str | None = Field(default=None, max_length=255)
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    status: str | None = None
    metadata_json: dict | None = None


class OutboxMessageOut(BaseModel):
    id: UUID
    workspace_id: UUID
    task_id: UUID | None
    relationship_id: UUID | None
    contact_id: UUID | None
    contact_name: str | None = None
    created_by_user_id: UUID | None
    created_by_name: str | None = None
    to_email: str
    to_name: str | None
    subject: str
    body: str
    status: str
    provider: str | None
    provider_message_id: str | None
    error_message: str | None
    sent_at: datetime | None
    metadata_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
