export type PriorityItem = {
  relationship_id: string;
  name: string;
  priority_score: number;
  last_contacted_at: string | null;
  summary: string | null;
  suggested_message: string | null;
  why_now: string;
  confidence_indicator: string;
  reason_tag: string;
  urgency_level: string;
  signal_reasons: string[];
};

export type SignalContribution = {
  signal_key: string;
  label: string;
  reason: string;
  weight: number;
  magnitude: number;
  impact: number;
};

export type ScoreExplanation = {
  relationship_id: string;
  name: string;
  priority_score: number;
  base_score: number;
  total_signal_impact: number;
  urgency_level: string;
  contributions: SignalContribution[];
};

export type ContentInsight = {
  id: string;
  content_id: string;
  summary: string;
  key_points: string[];
  suggested_angles: string[];
  created_at: string;
};

export type ContentItem = {
  id: string;
  title: string;
  description: string;
  source_type: "youtube" | "zoom" | "upload";
  source_url: string;
  thumbnail_url: string | null;
  owner_user_id: string | null;
  experiment_key: string | null;
  experiment_variant: "control" | "optimized" | null;
  created_at: string;
  latest_insight: ContentInsight | null;
};

export type ContentTarget = {
  relationship_id: string;
  name: string;
  reason: string;
  engagement_status: "pending" | "sent" | "responded" | "ignored";
  delivery_count: number;
  last_sent_at: string | null;
  last_engagement_at: string | null;
};

export type ContentFollowUpStep = {
  day_offset: number;
  label: string;
  suggested_message: string;
  targets: ContentTarget[];
};

export type ContentFollowUpResponse = {
  content_id: string;
  steps: ContentFollowUpStep[];
};

export type FollowUpExecuteResponse = {
  content_id: string;
  day_offset: number;
  executed_count: number;
  queued_count: number;
  dispatch_mode: "immediate" | "queued";
  relationship_ids: string[];
};

export type CampaignExecutionSummary = {
  sent: number;
  engaged: number;
  ignored: number;
  next_actions_suggested: number;
};

export type EventItem = {
  id: string;
  title: string;
  description: string;
  event_type: "weekly" | "monthly" | "one-time";
  event_url: string;
  day_of_week: number | null;
  time_of_day: string;
  owner_user_id: string | null;
  created_at: string;
};

export type ContentCampaignStats = {
  content_id: string;
  title: string;
  experiment_key: string | null;
  experiment_variant: "control" | "optimized" | null;
  sent_count: number;
  responded_count: number;
  ignored_count: number;
  pending_count: number;
};

export type CampaignInsightMetric = {
  label: string;
  detail: string;
};

export type CampaignNormalizedMetric = {
  label: string;
  count: number;
  formatted_rate: string;
  detail: string | null;
};

export type CampaignComparisonMetric = {
  label: string;
  control_value: string;
  optimized_value: string;
  lift: string;
  winner: string | null;
};

export type CampaignComparisonSummary = {
  experiment_key: string;
  control_campaign_title: string;
  optimized_campaign_title: string;
  compared_within_hours: number;
  window_valid: boolean;
  winning_strategy: string;
  metrics: CampaignComparisonMetric[];
};

export type CampaignProofSummary = {
  minimum_sample_size: number;
  current_sample_size: number;
  sample_size_valid: boolean;
  experiment_window_hours: number;
  experiment_rules: string[];
  comparison_status: string;
  comparison: CampaignComparisonSummary | null;
  average_time_to_response_hours: number | null;
  confidence_label: string;
  confidence_score: number;
  evidence_campaign_count: number;
  evidence_send_count: number;
  consistency_label: string;
  projected_lift_low: number | null;
  projected_lift_high: number | null;
  projected_lift_basis: string;
  baseline_metrics: CampaignNormalizedMetric[];
  action_applied: string[];
};

export type CampaignInsights = {
  sent_count: number;
  engaged_count: number;
  ignored_count: number;
  next_actions_suggested: number;
  insights: CampaignInsightMetric[];
  proof_summary: CampaignProofSummary;
  suggestion: {
    suggested_preset: string;
    suggested_tone: string;
    suggested_target_tags: string[];
    suggested_weight_adjustments: Record<string, number>;
  };
};
