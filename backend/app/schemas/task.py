from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FollowUpTaskCreate(BaseModel):
    relationship_id: UUID | None = None
    contact_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    suggested_message: str | None = None
    task_type: str = "follow_up"
    priority: str = "normal"
    due_at: datetime | None = None
    assigned_to_user_id: UUID | None = None
    metadata_json: dict = Field(default_factory=dict)


class FollowUpTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    suggested_message: str | None = None
    task_type: str | None = None
    status: str | None = None
    priority: str | None = None
    due_at: datetime | None = None
    assigned_to_user_id: UUID | None = None
    metadata_json: dict | None = None


class FollowUpTaskOut(BaseModel):
    id: UUID
    workspace_id: UUID
    relationship_id: UUID | None
    contact_id: UUID | None
    contact_name: str | None = None
    title: str
    description: str | None
    suggested_message: str | None
    task_type: str
    status: str
    priority: str
    due_at: datetime | None
    assigned_to_user_id: UUID | None
    assigned_to_name: str | None = None
    assigned_to_email: str | None = None
    created_by_user_id: UUID | None
    created_by_name: str | None = None
    completed_at: datetime | None
    metadata_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
