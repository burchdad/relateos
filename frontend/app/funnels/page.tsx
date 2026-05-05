"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { ContentAsset, FunnelCampaign } from "@/components/types";

const CONTENT_TYPES = ["podcast", "podcast_clip", "webinar", "livestream", "reel", "short", "post", "email", "ad", "landing_page", "lead_magnet"];

type FunnelResult = {
  content_asset_id: string;
  clips: { title: string; hook: string }[];
  captions: string[];
  hooks: string[];
  email_followup: string;
  dm_followup: string;
  ad_copy: { headline: string; body: string }[];
  landing_page_concept: string;
  target_segments: string[];
  lead_magnet_idea: string;
};

export default function ContentFunnelsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [campaigns, setCampaigns] = useState<FunnelCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content_type: "podcast", source_url: "", transcript: "" });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ContentAsset | null>(null);
  const [generating, setGenerating] = useState(false);
  const [funnelResult, setFunnelResult] = useState<FunnelResult | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`${API_URL}/content-assets`, { cache: "no-store" }),
        fetch(`${API_URL}/funnel-campaigns`, { cache: "no-store" }),
      ]);
      if (aRes.ok) setAssets(await aRes.json());
      if (cRes.ok) setCampaigns(await cRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/content-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ title: "", content_type: "podcast", source_url: "", transcript: "" });
        await fetchData();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFunnel = async () => {
    if (!selected) return;
    setGenerating(true);
    setFunnelResult(null);
    try {
      const res = await fetch(`${API_URL}/content-assets/${selected.id}/generate-funnel`, { method: "POST" });
      if (res.ok) setFunnelResult(await res.json());
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Content Funnels</h2>
          <p className="text-sm text-muted mt-1">Turn podcast clips, webinars, and content into relationship-driven campaigns.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
          + Add Content Asset
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Content Asset</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <input required placeholder="Title" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <select value={form.content_type} onChange={e => setForm(p => ({ ...p, content_type: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none">
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <input placeholder="Source URL" value={form.source_url}
              onChange={e => setForm(p => ({ ...p, source_url: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <textarea placeholder="Paste transcript or notes…" value={form.transcript}
              onChange={e => setForm(p => ({ ...p, transcript: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
            />
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Asset list */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted uppercase tracking-wide">Content Assets</h3>
          {loading && <p className="text-muted text-sm">Loading…</p>}
          {!loading && assets.length === 0 && <p className="text-muted text-sm">No assets yet.</p>}
          {assets.map(a => (
            <div key={a.id} onClick={() => { setSelected(a); setFunnelResult(null); }}
              className={`rounded-xl border p-4 cursor-pointer transition hover:border-accent/40 ${selected?.id === a.id ? "border-accent/60 bg-panel" : "border-soft bg-panel/50"}`}>
              <p className="font-medium text-text text-sm">{a.title}</p>
              <p className="text-xs text-muted mt-1 capitalize">{a.content_type.replace(/_/g, " ")} · {a.status}</p>
              {a.summary && <p className="text-xs text-muted mt-2 line-clamp-2">{a.summary}</p>}
            </div>
          ))}
        </div>

        {/* Detail / funnel gen panel */}
        {selected && (
          <div className="md:col-span-2 space-y-5">
            <div className="rounded-xl border border-soft bg-panel p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text">{selected.title}</h3>
                  <p className="text-xs text-muted capitalize mt-1">{selected.content_type.replace(/_/g, " ")}</p>
                </div>
                <button onClick={handleGenerateFunnel} disabled={generating}
                  className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
                  {generating ? "Generating…" : "✦ Generate Funnel"}
                </button>
              </div>
              {selected.source_url && (
                <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-2 block">{selected.source_url}</a>
              )}
              {selected.transcript && (
                <div className="mt-3">
                  <p className="text-xs text-muted uppercase tracking-wide mb-1">Transcript Preview</p>
                  <p className="text-xs text-muted line-clamp-3">{selected.transcript}</p>
                </div>
              )}
            </div>

            {funnelResult && (
              <div className="space-y-4">
                <div className="rounded-xl border border-soft bg-panel p-5">
                  <p className="text-sm font-semibold text-text mb-3">Target Segments</p>
                  <div className="flex flex-wrap gap-2">
                    {funnelResult.target_segments.map(s => (
                      <span key={s} className="text-xs px-2 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent capitalize">{s}</span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-soft bg-panel p-5 space-y-3">
                  <p className="text-sm font-semibold text-text">Clip Angles</p>
                  {funnelResult.clips.map((c, i) => (
                    <div key={i} className="rounded-lg bg-base border border-soft p-3">
                      <p className="text-xs font-medium text-accent">{c.title}</p>
                      <p className="text-xs text-muted mt-1">Hook: {c.hook}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-soft bg-panel p-5 space-y-2">
                  <p className="text-sm font-semibold text-text">Captions</p>
                  {funnelResult.captions.map((c, i) => (
                    <div key={i} className="rounded-lg bg-base border border-soft p-3 text-xs text-muted">{c}</div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-soft bg-panel p-5">
                    <p className="text-xs font-semibold text-text mb-2 uppercase tracking-wide">Email Follow-Up</p>
                    <p className="text-xs text-muted whitespace-pre-wrap">{funnelResult.email_followup}</p>
                  </div>
                  <div className="rounded-xl border border-soft bg-panel p-5">
                    <p className="text-xs font-semibold text-text mb-2 uppercase tracking-wide">DM Follow-Up</p>
                    <p className="text-xs text-muted">{funnelResult.dm_followup}</p>
                    <p className="text-xs font-semibold text-text mb-2 mt-3 uppercase tracking-wide">Lead Magnet Idea</p>
                    <p className="text-xs text-muted">{funnelResult.lead_magnet_idea}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Campaigns */}
      {campaigns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Funnel Campaigns</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {campaigns.map(c => (
              <div key={c.id} className="rounded-xl border border-soft bg-panel p-4">
                <p className="font-medium text-text text-sm">{c.title}</p>
                <p className="text-xs text-muted mt-1 capitalize">{c.campaign_type.replace(/_/g, " ")} · {c.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
