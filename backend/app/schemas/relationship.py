from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PersonCreate(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    tags: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)


class RelationshipCreate(BaseModel):
    person: PersonCreate
    type: str
    lifecycle_stage: str = "new"
    relationship_strength: float = 0.0
    owner_user_id: str | None = None


class PersonOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    tags: dict
    metadata: dict = Field(alias="metadata_json")

    model_config = {"from_attributes": True, "populate_by_name": True}


class RelationshipOut(BaseModel):
    id: UUID
    type: str
    lifecycle_stage: str
    relationship_strength: float
    priority_score: float
    last_contacted_at: datetime | None
    next_suggested_action_at: datetime | None
    owner_user_id: str | None
    person: PersonOut

    model_config = {"from_attributes": True}


class RelationshipUpdateStage(BaseModel):
    lifecycle_stage: str
