from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    org_type: str = "other"
    parent_organization_id: UUID | None = None
    owner_user_id: str | None = None
    description: str | None = None
    website: str | None = None
    location: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = None
    org_type: str | None = None
    parent_organization_id: UUID | None = None
    description: str | None = None
    website: str | None = None
    location: str | None = None


class OrganizationOut(BaseModel):
    id: UUID
    name: str
    org_type: str
    parent_organization_id: UUID | None
    owner_user_id: str | None
    description: str | None
    website: str | None
    location: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationNetworkSummary(BaseModel):
    organization_id: UUID
    name: str
    contact_count: int
    deal_count: int
    total_revenue: float
    active_deals: int
    top_contacts: list[dict]
