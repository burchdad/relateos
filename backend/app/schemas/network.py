from pydantic import BaseModel
from uuid import UUID


class NetworkNode(BaseModel):
    id: str
    label: str
    type: str
    role: str | None
    organization_id: str | None
    lifetime_value: float
    deal_count: int
    relationship_strength_score: float
    size: float
    color_group: str


class NetworkEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str
    strength: float
    revenue_attributed: float
    deal_count: int


class NetworkGraphResponse(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]


class TopPartnerEntry(BaseModel):
    contact_id: str
    name: str
    revenue: float
    deal_count: int
    referral_count: int


class ScoreboardResponse(BaseModel):
    total_network_revenue: float
    trailing_30_day_revenue: float
    trailing_90_day_revenue: float
    top_partners_by_revenue: list[TopPartnerEntry]
    top_referrers: list[TopPartnerEntry]
    most_active_contacts: list[dict]
    deals_in_flight: int
    referral_fees_pending: float
    gamification_leaderboard: list[dict]
