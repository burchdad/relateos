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
};
