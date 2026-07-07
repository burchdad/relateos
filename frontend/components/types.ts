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

export type TimelineItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  body: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type FollowUpQueueItem = {
  relationship_id: string;
  contact_id: string | null;
  name: string;
  priority_score: number;
  urgency_level: string;
  reason_tag: string;
  why_now: string;
  suggested_message: string | null;
  last_contacted_at: string | null;
  days_since_contact: number | null;
  signal_reasons: string[];
};

export type FollowUpTask = {
  id: string;
  workspace_id: string;
  relationship_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  title: string;
  description: string | null;
  suggested_message: string | null;
  task_type: string;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  created_by_user_id: string | null;
  completed_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContentInsight = {
  id: string;
  content_id: string;
  summary: string;
  key_points: string[];
  suggested_angles: string[];
  created_at: string;
};

export type ContentSourceType =
  | "youtube"
  | "zoom"
  | "skool"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "podcast"
  | "newsletter"
  | "website"
  | "upload";

export type ContentItem = {
  id: string;
  title: string;
  description: string;
  source_type: ContentSourceType;
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

export type SkoolAgentCapability = {
  key: string;
  label: string;
  status: "ready" | "needs_connector" | "planned";
  detail: string;
};

export type SkoolAgentStatus = {
  community_url: string;
  classroom_url: string;
  schedule_label: string;
  timezone: string;
  status: "ready" | "needs_connector" | "queued";
  last_sync_mode: string | null;
  last_sync_at: string | null;
  next_session_label: string;
  capabilities: SkoolAgentCapability[];
  next_steps: string[];
};

export type SkoolAgentSyncResponse = SkoolAgentStatus & {
  job_id: string;
  requested_mode: "archive" | "live_session" | "full";
  created_content_count: number;
  created_meeting_count: number;
  discovered_session_count: number;
  message: string;
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

// ============================================================
// Network Intelligence Types (Phase 1)
// ============================================================

export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  primary_role: string | null;
  role_family: string | null;
  market_segment: string | null;
  secondary_roles: string[];
  organization_id: string | null;
  source: string | null;
  relationship_stage: string | null;
  relationship_strength_score: number;
  lifetime_value: number;
  referral_value: number;
  last_engaged_at: string | null;
  notes_summary: string | null;
  ai_profile_summary: string | null;
  data_quality_score: number;
  enrichment_status: string | null;
  tags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  relationship_id: string | null;
  relationship_type: string | null;
  relationship_lifecycle_stage: string | null;
  relationship_strength: number | null;
  priority_score: number | null;
  last_contacted_at: string | null;
  next_suggested_action_at: string | null;
  relationship_interests: string | null;
};

export type Organization = {
  id: string;
  name: string;
  org_type: string;
  parent_organization_id: string | null;
  owner_user_id: string | null;
  description: string | null;
  website: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
};

export type DealParticipant = {
  id: string;
  deal_id: string;
  contact_id: string | null;
  role: string;
  split_percentage: number;
  split_amount: number;
  referral_fee: number;
  notes: string | null;
  created_at: string;
};

export type Deal = {
  id: string;
  title: string;
  description: string | null;
  deal_type: string;
  status: string;
  primary_contact_id: string | null;
  organization_id: string | null;
  source_contact_id: string | null;
  referred_by_contact_id: string | null;
  amount: number;
  expected_value: number;
  actual_value: number;
  probability: number;
  close_date: string | null;
  participants: DealParticipant[];
  created_at: string;
  updated_at: string;
};

export type NetworkNode = {
  id: string;
  label: string;
  type: string;
  role: string | null;
  role_label: string | null;
  role_family: string | null;
  market_segment: string | null;
  organization_id: string | null;
  lifetime_value: number;
  deal_count: number;
  relationship_strength_score: number;
  size: number;
  color_group: string;
};

export type NetworkEdge = {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
  revenue_attributed: number;
  deal_count: number;
  evidence: Record<string, unknown>;
};

export type NetworkGraph = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

export type TopPartnerEntry = {
  contact_id: string;
  name: string;
  revenue: number;
  deal_count: number;
  referral_count: number;
};

export type Scoreboard = {
  total_network_revenue: number;
  trailing_30_day_revenue: number;
  trailing_90_day_revenue: number;
  top_partners_by_revenue: TopPartnerEntry[];
  top_referrers: TopPartnerEntry[];
  most_active_contacts: { id: string; name: string; lifetime_value: number }[];
  deals_in_flight: number;
  referral_fees_pending: number;
  gamification_leaderboard: {
    rank: number;
    contact_id: string;
    name: string;
    score: number;
    revenue: number;
    deal_count: number;
    referral_count: number;
  }[];
};

export type MeetingAttendee = {
  id: string;
  meeting_id: string;
  contact_id: string | null;
  name: string | null;
  email: string | null;
  attendance_status: string;
  joined_at: string | null;
  left_at: string | null;
  duration_seconds: number;
  followup_status: string;
  created_at: string;
};

export type Meeting = {
  id: string;
  title: string;
  platform: string | null;
  meeting_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  transcript: string | null;
  summary: string | null;
  action_items: string[];
  source_provider: string | null;
  external_meeting_id: string | null;
  raw_report: Record<string, unknown>;
  attendees: MeetingAttendee[];
  created_at: string;
  updated_at: string;
};

export type MeetingRecordingAnalysis = {
  meeting_id: string;
  status: string;
  message: string;
  summary: string | null;
  action_items: string[];
  participants: Record<string, unknown>[];
  attendees_added: number;
  contacts_created: number;
  relationship_edges_created: number;
  transcript_available: boolean;
  source_notes: string[];
};

export type RecordingArtifact = {
  id: string;
  meeting_id: string;
  artifact_type: string;
  file_name: string | null;
  content_type: string | null;
  source_url: string | null;
  text_content: string | null;
  file_size_bytes: number;
  status: string;
  extraction_notes: string[];
  raw_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RecordingArtifactSummary = {
  total: number;
  ready_text: number;
  pending_transcription: number;
  media: number;
  text_characters: number;
};

export type RecordingTranscriptionResponse = {
  meeting_id: string;
  processed: number;
  transcripts_created: number;
  skipped: number;
  errors: string[];
  artifacts: RecordingArtifact[];
};

export type ContentAsset = {
  id: string;
  title: string;
  content_type: string;
  source_url: string | null;
  transcript: string | null;
  summary: string | null;
  ai_angles: Record<string, unknown>;
  target_audience: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FunnelCampaign = {
  id: string;
  title: string;
  description: string | null;
  campaign_type: string;
  content_asset_id: string | null;
  target_segment: Record<string, unknown>;
  status: string;
  metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NaturalLanguageDealResult = {
  parsed: Partial<Deal>;
  confidence: number;
  missing_fields: string[];
  needs_confirmation: boolean;
  raw_input: string;
};

export type ConnectorField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder: string;
};

export type ConnectorStatus = {
  key: "skool" | "zoom" | "google_calendar" | "read_ai" | "openai";
  name: string;
  status: "ready" | "needs_config" | "partial";
  purpose: string;
  fields: ConnectorField[];
  configured_fields: string[];
  missing_fields: string[];
  last_updated_at: string | null;
};

export type ConnectionsOverview = {
  connectors: ConnectorStatus[];
  pipeline: string[];
  recommended_next_step: string;
};

export type AgentSyncResponse = {
  job_id: string;
  status: "queued" | "needs_config" | "completed" | "partial";
  mode: "archive" | "live_session" | "full";
  message: string;
  pipeline: string[];
  blockers: string[];
  requested_at: string;
  imported_content_count: number;
  imported_meeting_count: number;
  imported_attendee_count: number;
  imported_artifact_count: number;
  recordings_found_count: number;
  ai_notes_found_count: number;
  errors: string[];
};

