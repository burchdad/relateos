"use client";

import { useMemo, useState } from "react";

import MessageComposer from "@/components/MessageComposer";
import { CampaignExecutionSummary, ContentFollowUpStep } from "@/components/types";

const BULK_SEND_MAX = 20;

type Props = {
  loading: boolean;
  steps: ContentFollowUpStep[];
  contentId: string;
  onSend: (relationshipId: string, message: string) => Promise<void>;
  onBulkSend: (
    contentId: string,
    dayOffset: number,
    relationshipIds: string[],
    dispatchMode: "immediate" | "queued",
    delayWindowMinutes: number
  ) => Promise<{
    executedCount: number;
    queuedCount: number;
    mode: "immediate" | "queued";
    campaignSummary?: CampaignExecutionSummary;
  }>;
};

export default function FollowUpPanel({ loading, steps, contentId, onSend, onBulkSend }: Props) {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [targetByStep, setTargetByStep] = useState<Record<number, string>>({});
  const [selectedByStep, setSelectedByStep] = useState<Record<number, string[]>>({});
  const [sendingBulk, setSendingBulk] = useState<Record<number, boolean>>({});
  const [dispatchModeByStep, setDispatchModeByStep] = useState<Record<number, "immediate" | "queued">>({});
  const [delayWindowByStep, setDelayWindowByStep] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<string>("");
  const [campaignSummary, setCampaignSummary] = useState<CampaignExecutionSummary | null>(null);

  const defaultTargets = useMemo(() => {
    const initial: Record<number, string> = {};
    for (const step of steps) {
      if (step.targets.length > 0) {
        initial[step.day_offset] = step.targets[0].relationship_id;
      }
    }
    return initial;
  }, [steps]);

  const resolveTarget = (dayOffset: number) => targetByStep[dayOffset] || defaultTargets[dayOffset] || "";
  const resolveSelected = (dayOffset: number, allIds: string[]) => selectedByStep[dayOffset] || allIds;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied follow-up message.");
    } catch {
      setStatus("Copy failed. Select and copy manually.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Generating follow-up sequence...</p>;
  }

  if (steps.length === 0) {
    return <p className="text-sm text-muted">No follow-up suggestions yet.</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-soft bg-canvas/60 p-3">
      {steps.map((step) => {
        const currentTarget = resolveTarget(step.day_offset);
        const allTargetIds = step.targets.map((target) => target.relationship_id);
        const selectedIds = resolveSelected(step.day_offset, allTargetIds);
        const overLimit = selectedIds.length > BULK_SEND_MAX;
        const dispatchMode = dispatchModeByStep[step.day_offset] || "immediate";
        const delayWindowMinutes = delayWindowByStep[step.day_offset] ?? 15;
        return (
          <div key={step.day_offset} className="rounded-md border border-soft bg-panel/50 p-3">
            <p className="text-sm font-semibold text-text">{step.label}</p>
            <p className="mt-2 rounded-md border border-soft bg-canvas/70 p-3 text-sm text-text/95">{step.suggested_message}</p>

            {step.targets.length > 0 ? (
              <div className="mt-2">
                <label className="text-xs uppercase tracking-wider text-muted">Target relationship</label>
                <select
                  value={currentTarget}
                  onChange={(e) => setTargetByStep((prev) => ({ ...prev, [step.day_offset]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
                >
                  {step.targets.map((target) => (
                    <option key={target.relationship_id} value={target.relationship_id}>
                      {target.name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 rounded-md border border-soft bg-canvas/50 p-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted">Bulk target selection</p>
                  <div className="mt-1 grid gap-1">
                    {step.targets.map((target) => {
                      const checked = selectedIds.includes(target.relationship_id);
                      return (
                        <label key={target.relationship_id} className="flex items-center gap-2 text-xs text-text">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedByStep((prev) => {
                                const current = prev[step.day_offset] || allTargetIds;
                                const next = checked
                                  ? current.filter((item) => item !== target.relationship_id)
                                  : [...current, target.relationship_id];
                                return { ...prev, [step.day_offset]: next };
                              });
                            }}
                            className="h-3.5 w-3.5 rounded border-soft bg-canvas text-accent"
                          />
                          {target.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 grid gap-2 rounded-md border border-soft bg-canvas/50 p-2 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted">Dispatch mode</label>
                    <select
                      value={dispatchMode}
                      onChange={(e) =>
                        setDispatchModeByStep((prev) => ({
                          ...prev,
                          [step.day_offset]: e.target.value as "immediate" | "queued",
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-soft bg-canvas px-2 py-1.5 text-xs text-text outline-none ring-accent/40 focus:ring"
                    >
                      <option value="immediate">Send now</option>
                      <option value="queued">Queue over window</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted">Delay window (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={delayWindowMinutes}
                      disabled={dispatchMode !== "queued"}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        setDelayWindowByStep((prev) => ({
                          ...prev,
                          [step.day_offset]: Number.isFinite(parsed) ? parsed : 15,
                        }));
                      }}
                      className="mt-1 w-full rounded-md border border-soft bg-canvas px-2 py-1.5 text-xs text-text outline-none ring-accent/40 focus:ring disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveStep((value) => (value === step.day_offset ? null : step.day_offset))}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
              >
                Send
              </button>
              <button
                onClick={() => copyText(step.suggested_message)}
                className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
              >
                Copy
              </button>
              <button
                onClick={async () => {
                  const count = selectedIds.length;
                  if (count > BULK_SEND_MAX) {
                    setStatus(`Send blocked: max ${BULK_SEND_MAX} per action, currently selected ${count}.`);
                    return;
                  }
                  const confirmed = window.confirm(
                    dispatchMode === "queued"
                      ? `You are about to queue ${step.label} for ${count} relationship${count === 1 ? "" : "s"} over ${delayWindowMinutes} minutes. Continue?`
                      : `You are about to send ${step.label} to ${count} relationship${count === 1 ? "" : "s"}. Continue?`
                  );
                  if (!confirmed) {
                    return;
                  }
                  setSendingBulk((prev) => ({ ...prev, [step.day_offset]: true }));
                  try {
                    const result = await onBulkSend(
                      contentId,
                      step.day_offset,
                      selectedIds,
                      dispatchMode,
                      delayWindowMinutes
                    );
                    if (result.campaignSummary) {
                      setCampaignSummary(result.campaignSummary);
                    }
                    if (result.mode === "queued") {
                      setStatus(`Queued ${result.queuedCount} follow-ups for ${step.label} over ${delayWindowMinutes} minutes.`);
                    } else {
                      setStatus(`Bulk sent to ${result.executedCount} relationships for ${step.label}.`);
                    }
                  } catch (error) {
                    const message = error instanceof Error ? error.message : "Bulk send failed.";
                    setStatus(message);
                  } finally {
                    setSendingBulk((prev) => ({ ...prev, [step.day_offset]: false }));
                  }
                }}
                disabled={selectedIds.length === 0 || overLimit || Boolean(sendingBulk[step.day_offset])}
                className="rounded-md border border-accent/50 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingBulk[step.day_offset]
                  ? dispatchMode === "queued"
                    ? "Queueing..."
                    : "Sending..."
                  : dispatchMode === "queued"
                    ? `Queue selected (${selectedIds.length})`
                    : `Send to all selected (${selectedIds.length})`}
              </button>
            </div>

            {overLimit ? (
              <p className="mt-2 text-xs text-amber-200">
                Max {BULK_SEND_MAX} recipients per bulk action. Deselect {selectedIds.length - BULK_SEND_MAX} to continue.
              </p>
            ) : null}

            {activeStep === step.day_offset && currentTarget ? (
              <div className="mt-3">
                <MessageComposer
                  initialMessage={step.suggested_message}
                  onSend={async (message) => {
                    await onSend(currentTarget, message);
                    setStatus("Message sent and logged as interaction.");
                    setActiveStep(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {campaignSummary ? (
        <div className="rounded-md border border-soft bg-panel/70 p-3">
          <p className="text-xs uppercase tracking-wider text-accent">Campaign Summary</p>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>
              Sent: <span className="font-semibold text-text">{campaignSummary.sent}</span>
            </p>
            <p>
              Engaged: <span className="font-semibold text-emerald-200">{campaignSummary.engaged}</span>
            </p>
            <p>
              Ignored: <span className="font-semibold text-amber-200">{campaignSummary.ignored}</span>
            </p>
            <p>
              Next actions suggested: <span className="font-semibold text-text">{campaignSummary.next_actions_suggested}</span>
            </p>
          </div>
        </div>
      ) : null}

      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </div>
  );
}
