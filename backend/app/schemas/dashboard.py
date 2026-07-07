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


class MorningBriefItem(BaseModel):
    relationship_id: UUID
    contact_id: UUID | None = None
    name: str
    priority_score: float
    urgency_level: str
    reason_tag: str
    why_now: str
    recommended_action: str
    suggested_message: str | None
    last_contacted_at: datetime | None
    signal_reasons: list[str]


class MorningBrief(BaseModel):
    generated_at: datetime
    headline: str
    focus_count: int
    open_task_count: int
    overdue_task_count: int
    items: list[MorningBriefItem]
    next_steps: list[str]


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
