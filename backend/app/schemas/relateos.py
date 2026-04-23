from pydantic import BaseModel, Field


class SignalPresetResponse(BaseModel):
    active_preset: str
    available_presets: list[str]
    weights: dict[str, float]


class SignalPresetUpdateRequest(BaseModel):
    preset_name: str = Field(min_length=3, max_length=50)


class RecalculateScoresResponse(BaseModel):
    updated_count: int


class CampaignInsightMetric(BaseModel):
    label: str
    detail: str


class CampaignOptimizationSuggestion(BaseModel):
    suggested_preset: str
    suggested_tone: str
    suggested_target_tags: list[str]
    suggested_weight_adjustments: dict[str, float]


class CampaignOptimizationResponse(BaseModel):
    sent_count: int
    engaged_count: int
    ignored_count: int
    next_actions_suggested: int
    insights: list[CampaignInsightMetric]
    suggestion: CampaignOptimizationSuggestion


class ApplyCampaignAdjustmentsResponse(BaseModel):
    applied_preset: str
    updated_scores: int
    message: str
