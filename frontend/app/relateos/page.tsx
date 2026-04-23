"use client";

import { useEffect, useMemo, useState } from "react";

import CampaignProofPanel from "@/components/CampaignProofPanel";
import { resolveApiUrl } from "@/components/api";
import { CampaignInsights } from "@/components/types";

type StyleProfile = {
  owner_user_id: string;
  tone: string;
  length: string;
  energy: string;
  emoji_usage: string;
};

type SignalPreset = {
  active_preset: string;
  available_presets: string[];
  weights: Record<string, number>;
};

const defaultStyle: StyleProfile = {
  owner_user_id: "demo-owner",
  tone: "casual",
  length: "short",
  energy: "medium",
  emoji_usage: "low",
};

export default function RelateOSPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [ownerUserId, setOwnerUserId] = useState("demo-owner");
  const [style, setStyle] = useState<StyleProfile>(defaultStyle);
  const [signalPreset, setSignalPreset] = useState<SignalPreset | null>(null);
  const [campaignInsights, setCampaignInsights] = useState<CampaignInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [applyingInsights, setApplyingInsights] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setInsightsLoading(true);
      setStatus("");
      try {
        const [styleRes, presetRes, insightsRes] = await Promise.all([
          fetch(`${API_URL}/preferences/style/${ownerUserId}`, { cache: "no-store" }),
          fetch(`${API_URL}/relateos/signal-preset`, { cache: "no-store" }),
          fetch(`${API_URL}/relateos/campaign-insights`, { cache: "no-store" }),
        ]);

        if (styleRes.ok) {
          const stylePayload = (await styleRes.json()) as StyleProfile;
          setStyle(stylePayload);
        }
        if (presetRes.ok) {
          const presetPayload = (await presetRes.json()) as SignalPreset;
          setSignalPreset(presetPayload);
        }
        if (insightsRes.ok) {
          const insightsPayload = (await insightsRes.json()) as CampaignInsights;
          setCampaignInsights(insightsPayload);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load controls");
      } finally {
        setLoading(false);
        setInsightsLoading(false);
      }
    };

    load();
  }, [API_URL, ownerUserId]);

  const saveStyle = async () => {
    setStatus("");
    const res = await fetch(`${API_URL}/preferences/style/${ownerUserId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tone: style.tone,
        length: style.length,
        energy: style.energy,
        emoji_usage: style.emoji_usage,
      }),
    });

    if (!res.ok) {
      setStatus("Failed to save style profile");
      return;
    }

    const payload = (await res.json()) as StyleProfile;
    setStyle(payload);
    setStatus("Style profile saved.");
  };

  const applySignalPreset = async (presetName: string) => {
    setStatus("");
    const res = await fetch(`${API_URL}/relateos/signal-preset`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset_name: presetName }),
    });

    if (!res.ok) {
      setStatus("Failed to apply signal preset");
      return;
    }

    const payload = (await res.json()) as SignalPreset;
    setSignalPreset(payload);
    setStatus(`Signal preset applied: ${payload.active_preset}.`);
  };

  const recalculateScoresNow = async () => {
    setRecalculating(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/relateos/recalculate-scores`, {
        method: "POST",
      });
      if (!res.ok) {
        setStatus("Failed to recalculate scores.");
        return;
      }
      const payload = (await res.json()) as { updated_count: number };
      setStatus(`Recalculated ${payload.updated_count} relationship scores.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to recalculate scores.");
    } finally {
      setRecalculating(false);
    }
  };

  const applySuggestedAdjustments = async () => {
    setApplyingInsights(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/relateos/campaign-insights/apply`, {
        method: "POST",
      });
      if (!res.ok) {
        setStatus("Failed to apply suggested adjustments.");
        return;
      }
      const payload = (await res.json()) as { applied_preset: string; updated_scores: number; message: string };
      setStatus(payload.message);

      const [presetRes, insightsRes] = await Promise.all([
        fetch(`${API_URL}/relateos/signal-preset`, { cache: "no-store" }),
        fetch(`${API_URL}/relateos/campaign-insights`, { cache: "no-store" }),
      ]);
      if (presetRes.ok) {
        const presetPayload = (await presetRes.json()) as SignalPreset;
        setSignalPreset(presetPayload);
      }
      if (insightsRes.ok) {
        const insightsPayload = (await insightsRes.json()) as CampaignInsights;
        setCampaignInsights(insightsPayload);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to apply suggested adjustments.");
    } finally {
      setApplyingInsights(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">RelateOS Intelligence</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Control center for message style and scoring behavior. Changes here affect future AI suggestions and priority
          calculations.
        </p>
      </header>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-soft bg-panel/50 p-5">
          <h2 className="text-base font-semibold text-text">Message Style Profile</h2>
          <p className="mt-1 text-xs text-muted">Tune default message behavior for an owner user profile.</p>

          <div className="mt-3 grid gap-2">
            <input
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
              placeholder="Owner user ID"
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            />

            <select
              value={style.tone}
              onChange={(e) => setStyle((prev) => ({ ...prev, tone: e.target.value }))}
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            >
              <option value="casual">Casual</option>
              <option value="professional">Professional</option>
              <option value="direct">Direct</option>
            </select>

            <select
              value={style.length}
              onChange={(e) => setStyle((prev) => ({ ...prev, length: e.target.value }))}
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>

            <select
              value={style.energy}
              onChange={(e) => setStyle((prev) => ({ ...prev, energy: e.target.value }))}
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <select
              value={style.emoji_usage}
              onChange={(e) => setStyle((prev) => ({ ...prev, emoji_usage: e.target.value }))}
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
            </select>

            <button
              onClick={saveStyle}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110"
            >
              Save Style Profile
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-soft bg-panel/50 p-5">
          <h2 className="text-base font-semibold text-text">Signal Weight Preset</h2>
          <p className="mt-1 text-xs text-muted">Select how aggressively the scoring engine reacts to recent behavior.</p>

          {loading ? <p className="mt-3 text-sm text-muted">Loading preset controls...</p> : null}

          {!loading && signalPreset ? (
            <div className="mt-3">
              <select
                value={signalPreset.active_preset}
                onChange={(e) => applySignalPreset(e.target.value)}
                className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
              >
                {signalPreset.available_presets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <div className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-md border border-soft bg-canvas/60 p-2 text-xs text-muted">
                {Object.entries(signalPreset.weights).map(([key, value]) => (
                  <p key={key}>
                    {key}: <span className="text-text">{value}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-soft bg-panel/50 p-5">
        <h2 className="text-base font-semibold text-text">Scoring Refresh</h2>
        <p className="mt-1 text-xs text-muted">
          Run a one-click recalculation so new signal preset weights are reflected immediately in dashboard priorities.
        </p>
        <button
          onClick={recalculateScoresNow}
          disabled={recalculating}
          className="mt-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110 disabled:opacity-60"
        >
          {recalculating ? "Recalculating..." : "Recalculate all scores now"}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-soft bg-panel/50 p-5">
        <h2 className="text-base font-semibold text-text">Campaign Insights</h2>
        <p className="mt-1 text-xs text-muted">
          Optimization agent reads campaign outcomes, normalizes evidence, and packages the next optimization move into a proof-ready summary.
        </p>

        {insightsLoading ? <p className="mt-3 text-sm text-muted">Analyzing campaign performance...</p> : null}

        {!insightsLoading && campaignInsights ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 rounded-md border border-soft bg-canvas/60 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p>
                Sent: <span className="font-semibold text-text">{campaignInsights.sent_count}</span>
              </p>
              <p>
                Engaged: <span className="font-semibold text-emerald-200">{campaignInsights.engaged_count}</span>
              </p>
              <p>
                Ignored: <span className="font-semibold text-amber-200">{campaignInsights.ignored_count}</span>
              </p>
              <p>
                Avg. response time:{" "}
                <span className="font-semibold text-text">
                  {campaignInsights.proof_summary.average_time_to_response_hours !== null
                    ? `${campaignInsights.proof_summary.average_time_to_response_hours}h`
                    : "Pending"}
                </span>
              </p>
            </div>

            <CampaignProofPanel insights={campaignInsights} />

            <div className="rounded-md border border-soft bg-canvas/60 p-3 text-sm text-text">
              <p className="text-xs uppercase tracking-wider text-accent">Insights</p>
              <div className="mt-2 space-y-2">
                {campaignInsights.insights.map((entry) => (
                  <p key={entry.label}>
                    <span className="font-semibold">{entry.label}:</span> {entry.detail}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-soft bg-canvas/60 p-3 text-sm text-text">
              <p className="text-xs uppercase tracking-wider text-accent">Suggested Adjustments</p>
              <p className="mt-2">
                Preset: <span className="font-semibold">{campaignInsights.suggestion.suggested_preset}</span>
              </p>
              <p>
                Tone: <span className="font-semibold">{campaignInsights.suggestion.suggested_tone}</span>
              </p>
              <p>
                Target tags: <span className="font-semibold">{campaignInsights.suggestion.suggested_target_tags.join(", ") || "None yet"}</span>
              </p>
              <div className="mt-2 grid gap-1 text-xs text-muted">
                {Object.entries(campaignInsights.suggestion.suggested_weight_adjustments).map(([key, value]) => (
                  <p key={key}>
                    {key}: <span className="text-text">{value > 0 ? `+${value}` : value}</span>
                  </p>
                ))}
              </div>
            </div>

            <button
              onClick={applySuggestedAdjustments}
              disabled={applyingInsights}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110 disabled:opacity-60"
            >
              {applyingInsights ? "Applying..." : "Apply Suggested Adjustments"}
            </button>
          </div>
        ) : null}
      </section>

      {status ? <p className="mt-4 text-sm text-muted">{status}</p> : null}
    </main>
  );
}
