from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class InteractionCreate(BaseModel):
    relationship_id: UUID
    type: str
    content: str
    summary: str | None = None
    sentiment: float | None = None


class InteractionOut(BaseModel):
    id: UUID
    relationship_id: UUID
    type: str
    content: str
    summary: str | None
    sentiment: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
