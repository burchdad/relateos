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
      return "border-accent/40 bg-honey-light/30 text-text";
    }
    if (item.confidence_indicator === "At Risk") {
      return "border-accent/35 bg-honey-pale/60 text-text";
    }
    return "border-sage/30 bg-sage-pale/50 text-muted";
  }, [item.confidence_indicator]);

  const urgencyTone = useMemo(() => {
    if (item.urgency_level === "Act Today") {
      return "border-accent/40 bg-honey-light/30 text-text";
    }
    if (item.urgency_level === "This Week") {
      return "border-accent/35 bg-honey-pale/60 text-text";
    }
    return "border-sage/30 bg-sage-pale/50 text-muted";
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
    <article className={`card-reveal relative rounded-lg border border-soft/70 bg-white p-3 shadow-[0_6px_18px_rgba(28,58,42,0.08)] sm:p-4 ${showMoreActions ? "z-30" : "z-0"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="text-base font-semibold tracking-tight text-black">{item.name}</h3>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Priority {item.priority_score.toFixed(1)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${urgencyTone}`}>
              {item.urgency_level}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidenceTone}`}>
              {item.confidence_indicator}
            </span>
            <span className="rounded-full border border-soft/70 bg-soft/60 px-2 py-0.5 text-[10px] font-medium text-muted">
              {item.reason_tag}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.relationship_id)}
              className="h-3.5 w-3.5 rounded border-soft bg-canvas text-accent focus:ring-accent"
            />
            Select
          </label>
          <p className="rounded-full bg-soft/70 px-2.5 py-0.5 text-[11px] text-muted">Last contact: {lastContact}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-[13px] leading-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(360px,1.15fr)]">
        <div className="space-y-1.5">
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
        <p className="rounded-md border border-soft/70 bg-white p-2.5 text-text/95">
          {item.suggested_message ?? "Quick check-in could help maintain momentum and keep this relationship warm."}
        </p>
      </div>

      {showDetails ? (
        <div className="mt-3 space-y-2 rounded-lg border border-soft/70 bg-white p-3 text-sm">
          <p>
            <span className="text-amber">Why it matters:</span> {item.summary ?? "High-leverage relationship worth a proactive touchpoint."}
          </p>
          <p>
            <span className="text-amber">Signals:</span> {item.signal_reasons.join(" / ")}
          </p>
        </div>
      ) : null}

      {showComposer ? (
        <div className="mt-3">
          <MessageComposer initialMessage={item.suggested_message ?? ""} onSend={handleSend} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setShowComposer((v) => !v)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-text hover:brightness-110"
        >
          Send
        </button>
        <button
          onClick={() => setShowComposer((v) => !v)}
          className="rounded-md border border-soft/80 px-3 py-1.5 text-xs text-text hover:bg-soft/70"
        >
          Edit
        </button>
        <button
          onClick={handleToggleExplanation}
          className="rounded-md border border-soft/80 px-3 py-1.5 text-xs text-text hover:bg-soft/70"
        >
          {showExplanation ? "Hide score logic" : "Explain score"}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMoreActions((value) => !value)}
            className="rounded-md border border-soft/80 px-3 py-1.5 text-xs text-text hover:bg-soft/70"
            aria-expanded={showMoreActions}
          >
            More
          </button>
          {showMoreActions ? (
            <div className="absolute left-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-soft/80 bg-panel shadow-card">
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
        <div className="mt-3 rounded-lg border border-soft/70 bg-white p-3 text-xs text-text/90">
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
