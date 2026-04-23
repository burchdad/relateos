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
  sent_count: number;
  responded_count: number;
  ignored_count: number;
  pending_count: number;
};
