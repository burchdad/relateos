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


class ImportUploadResponse(BaseModel):
    file_name: str
    source_type: str
    sheet_name: str | None = None
    imported_sheet_names: list[str] = Field(default_factory=list)
    header_row_used: int | None = None
    rows_processed: int
    rows_skipped: int
    contacts_created: int
    contacts_updated: int
    organizations_created: int
    relationships_created: int
    relationship_edges_created: int
    suggested_column_mapping: dict[str, str]
    unmapped_columns: list[str]
    stored_extra_fields: list[str]
    warnings: list[str]


class ImportAnalyzeSheet(BaseModel):
    sheet_name: str
    detected_header_row: int | None = None
    row_count: int
    raw_columns: list[str]
    sample_rows: list[dict] = Field(default_factory=list)
    suggested_column_mapping: dict[str, str]
    confidence: float
    unmapped_columns: list[str]
    warnings: list[str]


class ImportAnalyzeResponse(BaseModel):
    file_name: str
    source_type: str
    sheets: list[ImportAnalyzeSheet]
    allowed_targets: list[str]
    warnings: list[str]


class ImportUrlRequest(BaseModel):
    source_type: str = "contacts"
    sheet_url: str
    sheet_name: str | None = None
    sheet_names: list[str] = Field(default_factory=list)
    header_row: int | None = Field(default=None, ge=1)
    include_all_sheets: bool = False
    mapping_override: dict[str, str] = Field(default_factory=dict)


class ImportAnalyzeUrlRequest(BaseModel):
    source_type: str = "contacts"
    sheet_url: str
    sheet_name: str | None = None
    sheet_names: list[str] = Field(default_factory=list)
    header_row: int | None = Field(default=None, ge=1)
    include_all_sheets: bool = True


