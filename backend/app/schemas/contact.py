from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    primary_role: str | None = None
    role_family: str | None = None
    market_segment: str | None = None
    secondary_roles: list[str] = Field(default_factory=list)
    organization_id: UUID | None = None
    source: str | None = None
    relationship_stage: str | None = None
    tags: dict = Field(default_factory=dict)
    notes_summary: str | None = None


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    primary_role: str | None = None
    role_family: str | None = None
    market_segment: str | None = None
    secondary_roles: list[str] | None = None
    organization_id: UUID | None = None
    source: str | None = None
    relationship_stage: str | None = None
    lifetime_value: float | None = None
    referral_value: float | None = None
    relationship_strength_score: float | None = None
    notes_summary: str | None = None
    ai_profile_summary: str | None = None
    enrichment_status: str | None = None
    tags: dict | None = None


class ContactOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    primary_role: str | None
    role_family: str | None
    market_segment: str | None
    secondary_roles: list
    organization_id: UUID | None
    source: str | None
    relationship_stage: str | None
    relationship_strength_score: float
    lifetime_value: float
    referral_value: float
    last_engaged_at: datetime | None
    notes_summary: str | None
    ai_profile_summary: str | None
    data_quality_score: float
    enrichment_status: str | None
    tags: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
