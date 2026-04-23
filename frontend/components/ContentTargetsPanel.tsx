"use client";

import { ContentTarget } from "@/components/types";

type Props = {
  loading: boolean;
  targets: ContentTarget[];
  onMarkEngagement: (relationshipId: string, status: "responded" | "ignored") => Promise<void>;
};

export default function ContentTargetsPanel({ loading, targets, onMarkEngagement }: Props) {
  if (loading) {
    return <p className="text-sm text-muted">Finding best relationship targets...</p>;
  }

  if (targets.length === 0) {
    return <p className="text-sm text-muted">No targets suggested yet.</p>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-soft bg-canvas/60 p-3">
      {targets.map((target) => (
        <div key={target.relationship_id} className="rounded-md border border-soft bg-panel/50 p-3 text-sm">
          <p className="font-medium text-text">{target.name}</p>
          <p className="mt-1 text-muted">{target.reason}</p>
          <p className="mt-1 text-xs text-muted">
            Status: {target.engagement_status} • Sent: {target.delivery_count}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => onMarkEngagement(target.relationship_id, "responded")}
              className="rounded-md border border-emerald-400/50 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
            >
              Mark Responded
            </button>
            <button
              onClick={() => onMarkEngagement(target.relationship_id, "ignored")}
              className="rounded-md border border-amber-400/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
            >
              Mark Ignored
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
