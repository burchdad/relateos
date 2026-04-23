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


class CampaignNormalizedMetric(BaseModel):
    label: str
    count: int
    formatted_rate: str
    detail: str | None = None


class CampaignComparisonMetric(BaseModel):
    label: str
    control_value: str
    optimized_value: str
    lift: str
    winner: str | None = None


class CampaignComparisonSummary(BaseModel):
    experiment_key: str
    control_campaign_title: str
    optimized_campaign_title: str
    compared_within_hours: float
    window_valid: bool
    winning_strategy: str
    metrics: list[CampaignComparisonMetric]


class CampaignProofSummary(BaseModel):
    minimum_sample_size: int
    current_sample_size: int
    sample_size_valid: bool
    experiment_window_hours: int
    experiment_rules: list[str]
    comparison_status: str
    comparison: CampaignComparisonSummary | None = None
    average_time_to_response_hours: float | None = None
    confidence_label: str
    confidence_score: int
    evidence_campaign_count: int
    evidence_send_count: int
    consistency_label: str
    projected_lift_low: int | None = None
    projected_lift_high: int | None = None
    projected_lift_basis: str
    baseline_metrics: list[CampaignNormalizedMetric]
    action_applied: list[str]


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
    proof_summary: CampaignProofSummary
    suggestion: CampaignOptimizationSuggestion


class ApplyCampaignAdjustmentsResponse(BaseModel):
    applied_preset: str
    updated_scores: int
    message: str
