from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ContentAssetCreate(BaseModel):
    title: str
    content_type: str = "post"
    source_url: str | None = None
    transcript: str | None = None
    status: str = "draft"


class ContentAssetUpdate(BaseModel):
    title: str | None = None
    content_type: str | None = None
    source_url: str | None = None
    transcript: str | None = None
    summary: str | None = None
    status: str | None = None


class ContentAssetOut(BaseModel):
    id: UUID
    title: str
    content_type: str
    source_url: str | None
    transcript: str | None
    summary: str | None
    ai_angles: dict
    target_audience: dict
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FunnelCampaignCreate(BaseModel):
    title: str
    description: str | None = None
    campaign_type: str = "other"
    content_asset_id: UUID | None = None
    target_segment: dict = Field(default_factory=dict)
    status: str = "draft"


class FunnelCampaignOut(BaseModel):
    id: UUID
    title: str
    description: str | None
    campaign_type: str
    content_asset_id: UUID | None
    target_segment: dict
    status: str
    metrics: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContentFunnelGenerateResponse(BaseModel):
    content_asset_id: UUID
    clips: list[dict]
    captions: list[str]
    hooks: list[str]
    email_followup: str
    dm_followup: str
    ad_copy: list[dict]
    landing_page_concept: str
    target_segments: list[str]
    lead_magnet_idea: str


class ImportMapRequest(BaseModel):
    source_type: str
    raw_columns: list[str]
    sample_rows: list[dict] = Field(default_factory=list)


class ImportMapResponse(BaseModel):
    suggested_table: str
    suggested_column_mapping: dict[str, str]
    confidence: float
    warnings: list[str]
    unmapped_fields: list[str]
