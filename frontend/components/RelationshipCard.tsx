"use client";

import { useMemo, useState } from "react";

import MessageComposer from "@/components/MessageComposer";
import { PriorityItem, ScoreExplanation } from "@/components/types";

type Props = {
  item: PriorityItem;
  onSimulateSend: (relationshipId: string, message: string) => Promise<void>;
  explanation?: ScoreExplanation;
  explanationLoading: boolean;
  onLoadExplanation: (relationshipId: string) => Promise<void>;
  selected: boolean;
  onToggleSelect: (relationshipId: string) => void;
  onDelete: (relationshipId: string) => Promise<void>;
  deleteDisabled?: boolean;
};

export default function RelationshipCard({
  item,
  onSimulateSend,
  explanation,
  explanationLoading,
  onLoadExplanation,
  selected,
  onToggleSelect,
  onDelete,
  deleteDisabled,
}: Props) {
  const [showComposer, setShowComposer] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [status, setStatus] = useState<string>("");

  const confidenceTone = useMemo(() => {
    if (item.confidence_indicator === "High Priority") {
      return "bg-red-500/20 text-red-200 border-red-400/40";
    }
    if (item.confidence_indicator === "At Risk") {
      return "bg-amber-500/20 text-amber-100 border-amber-400/40";
    }
    return "bg-emerald-500/20 text-emerald-100 border-emerald-400/40";
  }, [item.confidence_indicator]);

  const urgencyTone = useMemo(() => {
    if (item.urgency_level === "Act Today") {
      return "bg-red-500/20 text-red-200 border-red-400/40";
    }
    if (item.urgency_level === "This Week") {
      return "bg-amber-500/20 text-amber-100 border-amber-400/40";
    }
    return "bg-emerald-500/20 text-emerald-100 border-emerald-400/40";
  }, [item.urgency_level]);

  const lastContact = useMemo(() => {
    if (!item.last_contacted_at) {
      return "Context added";
    }
    const now = Date.now();
    const then = new Date(item.last_contacted_at).getTime();
    const diffMs = Math.max(0, now - then);
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) {
      return "today";
    }
    if (days === 1) {
      return "1 day ago";
    }
    if (days < 7) {
      return `${days} days ago`;
    }
    const weeks = Math.floor(days / 7);
    if (weeks === 1) {
      return "1 week ago";
    }
    return `${weeks} weeks ago`;
  }, [item.last_contacted_at]);

  const primarySignal = item.signal_reasons[0] ?? item.why_now;

  const handleSend = async (message: string) => {
    await onSimulateSend(item.relationship_id, message);
    setStatus("Sent and logged as interaction.");
    setShowComposer(false);
  };

  const handleToggleExplanation = async () => {
    const nextValue = !showExplanation;
    setShowExplanation(nextValue);
    if (nextValue && !explanation) {
      await onLoadExplanation(item.relationship_id);
    }
  };

  return (
    <article className="card-reveal rounded-xl border border-soft bg-panel p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold tracking-tight">{item.name}</h3>
            <p className="text-xs uppercase tracking-wider text-muted">Priority {item.priority_score.toFixed(1)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${urgencyTone}`}>
              {item.urgency_level}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidenceTone}`}>
              {item.confidence_indicator}
            </span>
            <span className="rounded-full border border-soft bg-soft px-2.5 py-1 text-[11px] font-medium text-muted">
              {item.reason_tag}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.relationship_id)}
              className="h-4 w-4 rounded border-soft bg-canvas text-accent focus:ring-accent"
            />
            Select
          </label>
          <p className="rounded-full bg-soft px-3 py-1 text-xs text-muted">Last contact: {lastContact}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          <p>
            <span className="text-amber">Now:</span> {item.why_now}
          </p>
          <p className="text-muted">
            <span className="text-amber">Top signal:</span> {primarySignal}
          </p>
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>
        <p className="rounded-md border border-soft bg-canvas/70 p-3 text-text/95">
          {item.suggested_message ?? "Quick check-in could help maintain momentum and keep this relationship warm."}
        </p>
      </div>

      {showDetails ? (
        <div className="mt-3 space-y-2 rounded-lg border border-soft bg-canvas/50 p-3 text-sm">
          <p>
            <span className="text-amber">Why it matters:</span> {item.summary ?? "High-leverage relationship worth a proactive touchpoint."}
          </p>
          <p>
            <span className="text-amber">Signals:</span> {item.signal_reasons.join(" / ")}
          </p>
        </div>
      ) : null}

      {showComposer ? (
        <div className="mt-4">
          <MessageComposer initialMessage={item.suggested_message ?? ""} onSend={handleSend} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowComposer((v) => !v)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
        >
          Send
        </button>
        <button
          onClick={() => setShowComposer((v) => !v)}
          className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
        >
          Edit
        </button>
        <button
          onClick={handleToggleExplanation}
          className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
        >
          {showExplanation ? "Hide score logic" : "Explain score"}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMoreActions((value) => !value)}
            className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
            aria-expanded={showMoreActions}
          >
            More
          </button>
          {showMoreActions ? (
            <div className="absolute left-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-soft bg-panel shadow-card">
              <button
                type="button"
                onClick={() => {
                  setStatus("Skipped for today.");
                  setShowMoreActions(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-soft"
              >
                Skip today
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus("Snoozed until tomorrow.");
                  setShowMoreActions(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-soft"
              >
                Snooze
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.relationship_id)}
                disabled={deleteDisabled}
                className="block w-full px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showExplanation ? (
        <div className="mt-4 rounded-lg border border-soft bg-canvas/60 p-3 text-xs text-text/90">
          {explanationLoading ? (
            <p className="text-muted">Loading score explanation...</p>
          ) : explanation ? (
            <>
              <p>
                Base score {explanation.base_score.toFixed(2)} + signal impact {explanation.total_signal_impact.toFixed(2)} ={" "}
                {explanation.priority_score.toFixed(2)}
              </p>
              <ul className="mt-2 space-y-1">
                {explanation.contributions.map((contribution) => (
                  <li key={`${item.relationship_id}-${contribution.signal_key}`}>
                    {contribution.label}: {contribution.impact.toFixed(2)} ({contribution.reason})
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted">No score explanation available.</p>
          )}
        </div>
      ) : null}

      {status ? <p className="mt-3 text-xs text-muted">{status}</p> : null}
    </article>
  );
}
