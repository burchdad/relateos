from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DealParticipantCreate(BaseModel):
    contact_id: UUID | None = None
    role: str = "other"
    split_percentage: float = 0.0
    split_amount: float = 0.0
    referral_fee: float = 0.0
    notes: str | None = None


class DealParticipantOut(BaseModel):
    id: UUID
    deal_id: UUID
    contact_id: UUID | None
    role: str
    split_percentage: float
    split_amount: float
    referral_fee: float
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DealCreate(BaseModel):
    title: str
    description: str | None = None
    deal_type: str = "other"
    status: str = "lead"
    primary_contact_id: UUID | None = None
    organization_id: UUID | None = None
    source_contact_id: UUID | None = None
    referred_by_contact_id: UUID | None = None
    amount: float = 0.0
    expected_value: float = 0.0
    probability: float = 0.0
    close_date: datetime | None = None
    participants: list[DealParticipantCreate] = Field(default_factory=list)


class DealUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    deal_type: str | None = None
    status: str | None = None
    amount: float | None = None
    expected_value: float | None = None
    actual_value: float | None = None
    probability: float | None = None
    close_date: datetime | None = None


class DealOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    deal_type: str
    status: str
    primary_contact_id: UUID | None
    organization_id: UUID | None
    source_contact_id: UUID | None
    referred_by_contact_id: UUID | None
    amount: float
    expected_value: float
    actual_value: float
    probability: float
    close_date: datetime | None
    participants: list[DealParticipantOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NaturalLanguageDealInput(BaseModel):
    text: str


class NaturalLanguageDealResult(BaseModel):
    parsed: DealCreate
    confidence: float
    missing_fields: list[str]
    needs_confirmation: bool
    raw_input: str
