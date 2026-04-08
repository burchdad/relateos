from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PriorityItem(BaseModel):
    relationship_id: UUID
    name: str
    priority_score: float
    last_contacted_at: datetime | None
    summary: str | None
    suggested_message: str | None
    why_now: str
    confidence_indicator: str
    reason_tag: str
