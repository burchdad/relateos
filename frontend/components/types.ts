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
