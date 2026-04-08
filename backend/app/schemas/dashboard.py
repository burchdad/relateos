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
    urgency_level: str
    signal_reasons: list[str]


class SignalContribution(BaseModel):
    signal_key: str
    label: str
    reason: str
    weight: float
    magnitude: float
    impact: float


class ScoreExplanation(BaseModel):
    relationship_id: UUID
    name: str
    priority_score: float
    base_score: float
    total_signal_impact: float
    urgency_level: str
    contributions: list[SignalContribution]
