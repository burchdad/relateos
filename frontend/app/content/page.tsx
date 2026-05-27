"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AddContentModal from "@/components/AddContentModal";
import ContentCard from "@/components/ContentCard";
import { resolveApiUrl } from "@/components/api";
import {
  CampaignExecutionSummary,
  ContentCampaignStats,
  ContentFollowUpResponse,
  ContentItem,
  ContentSourceType,
  ContentTarget,
  FollowUpExecuteResponse,
} from "@/components/types";

type LoadingMap = Record<string, boolean>;

const SOURCE_DIRECTORY: {
  type: ContentSourceType;
  label: string;
  description: string;
  status: "ready" | "sync_next" | "planned";
  url?: string;
}[] = [
  {
    type: "skool",
    label: "Our Deal Partner Skool",
    description: "Community posts, classroom resources, calls, and member-facing content.",
    status: "ready",
    url: "https://www.skool.com/ourdealpartner",
  },
  { type: "youtube", label: "YouTube", description: "Long-form videos, clips, webinars, and channel archives.", status: "sync_next" },
  { type: "facebook", label: "Facebook", description: "Page posts, group posts, lives, and audience comments.", status: "sync_next" },
  { type: "instagram", label: "Instagram", description: "Reels, carousels, stories, and DM-driving posts.", status: "sync_next" },
  { type: "zoom", label: "Zoom / Recordings", description: "Webinars, coaching calls, replays, and transcripts.", status: "ready" },
  { type: "podcast", label: "Podcast", description: "Episodes, guest clips, show notes, and follow-up assets.", status: "planned" },
];

export default function ContentPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [targetsByContent, setTargetsByContent] = useState<Record<string, ContentTarget[]>>({});
  const [followupsByContent, setFollowupsByContent] = useState<Record<string, ContentFollowUpResponse>>({});
  const [statsByContent, setStatsByContent] = useState<Record<string, ContentCampaignStats>>({});
  const [loadingTargets, setLoadingTargets] = useState<LoadingMap>({});
  const [loadingFollowups, setLoadingFollowups] = useState<LoadingMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ContentSourceType | "all">("all");
  const [query, setQuery] = useState("");

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/content`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load content");
      }
      const data = (await res.json()) as ContentItem[];
      setItems(data);
      const statsRes = await fetch(`${API_URL}/content/campaigns/active`, { cache: "no-store" });
      if (statsRes.ok) {
        const statsRows = (await statsRes.json()) as ContentCampaignStats[];
        setStatsByContent(
          Object.fromEntries(statsRows.map((row) => [row.content_id, row]))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const onCreateContent = async (payload: {
    title: string;
    description: string;
    source_type: ContentSourceType;
    source_url: string;
    experiment_key?: string;
    experiment_variant?: "control" | "optimized";
  }) => {
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to create content");
      }
      setShowAddModal(false);
      await loadContent();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create content");
    } finally {
      setCreating(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSource = sourceFilter === "all" || item.source_type === sourceFilter;
    const haystack = `${item.title} ${item.description} ${item.source_type} ${item.source_url}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesSource && matchesQuery;
  });

  const contentStats = useMemo(() => {
    const sourceCounts = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.source_type] = (acc[item.source_type] || 0) + 1;
      return acc;
    }, {});
    const targetCount = Object.values(statsByContent).reduce((sum, row) => sum + row.sent_count + row.pending_count, 0);
    const withInsights = items.filter(item => item.latest_insight).length;
    return { sourceCounts, targetCount, withInsights };
  }, [items, statsByContent]);

  const addSkoolDirectorySource = async () => {
    const skoolSource = SOURCE_DIRECTORY[0];
    if (!skoolSource.url) return;
    await onCreateContent({
      title: skoolSource.label,
      description: "Main Skool community for Our Deal Partner. Use this as the hub for community content, classroom posts, events, and member-facing delivery.",
      source_type: "skool",
      source_url: skoolSource.url,
    });
  };

  const onViewTargets = async (contentId: string, force = false) => {
    if (!force && (targetsByContent[contentId] || loadingTargets[contentId])) {
      return;
    }
    setLoadingTargets((prev) => ({ ...prev, [contentId]: true }));
    try {
      const res = await fetch(`${API_URL}/content/${contentId}/targets`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load targets");
      }
      const data = (await res.json()) as ContentTarget[];
      setTargetsByContent((prev) => ({ ...prev, [contentId]: data }));
    } finally {
      setLoadingTargets((prev) => ({ ...prev, [contentId]: false }));
    }
  };

  const onViewFollowups = async (contentId: string) => {
    if (followupsByContent[contentId] || loadingFollowups[contentId]) {
      return;
    }
    setLoadingFollowups((prev) => ({ ...prev, [contentId]: true }));
    try {
      const res = await fetch(`${API_URL}/content/${contentId}/followups`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load follow-ups");
      }
      const data = (await res.json()) as ContentFollowUpResponse;
      setFollowupsByContent((prev) => ({ ...prev, [contentId]: data }));
    } finally {
      setLoadingFollowups((prev) => ({ ...prev, [contentId]: false }));
    }
  };

  const onSendMessage = async (relationshipId: string, message: string) => {
    await fetch(`${API_URL}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationship_id: relationshipId,
        type: "note",
        content: message,
        summary: "Content follow-up sent",
        sentiment: 0.8,
      }),
    });
  };

  const onBulkSend = async (
    contentId: string,
    dayOffset: number,
    relationshipIds: string[],
    dispatchMode: "immediate" | "queued",
    delayWindowMinutes: number
  ) => {
    const res = await fetch(`${API_URL}/content/${contentId}/followups/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_offset: dayOffset,
        relationship_ids: relationshipIds,
        dispatch_mode: dispatchMode,
        delay_window_minutes: delayWindowMinutes,
      }),
    });
    if (!res.ok) {
      let detail = "Failed to execute bulk follow-up";
      try {
        const payload = (await res.json()) as { detail?: string };
        if (payload?.detail) {
          detail = payload.detail;
        }
      } catch {
        detail = "Failed to execute bulk follow-up";
      }
      throw new Error(detail);
    }
    const data = (await res.json()) as FollowUpExecuteResponse;
    let campaignSummary: CampaignExecutionSummary | undefined;
    try {
      const statsRes = await fetch(`${API_URL}/content/${contentId}/stats`, { cache: "no-store" });
      if (statsRes.ok) {
        const stats = (await statsRes.json()) as ContentCampaignStats;
        setStatsByContent((prev) => ({ ...prev, [contentId]: stats }));
        campaignSummary = {
          sent: stats.sent_count,
          engaged: stats.responded_count,
          ignored: stats.ignored_count,
          next_actions_suggested: stats.responded_count,
        };
      }
    } catch {
      // Preserve execution success even if summary refresh fails.
    }
    if (data.dispatch_mode === "immediate") {
      await onViewTargets(contentId, true);
    }
    return {
      executedCount: data.executed_count,
      queuedCount: data.queued_count,
      mode: data.dispatch_mode,
      campaignSummary,
    };
  };

  const onMarkEngagement = async (contentId: string, relationshipId: string, status: "responded" | "ignored") => {
    const res = await fetch(`${API_URL}/content/${contentId}/engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationship_id: relationshipId,
        status,
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to update engagement");
    }
    const updated = (await res.json()) as ContentTarget;
    setTargetsByContent((prev) => ({
      ...prev,
      [contentId]: (prev[contentId] || []).map((target) => (target.relationship_id === updated.relationship_id ? updated : target)),
    }));
  };

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Content directory</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">Content</h1>
          <p className="text-sm text-muted mt-1">
            Centralize Skool, YouTube, Facebook, Instagram, Zoom, and other content so past assets can feed relationship workflows.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110"
          >
            Add Content
          </button>
          <Link href="/relationships?intent=targets" className="rounded-lg border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40">
            View Targets in Relationships
          </Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Library items", items.length],
          ["Sources", Object.keys(contentStats.sourceCounts).length],
          ["With insights", contentStats.withInsights],
          ["Campaign targets", contentStats.targetCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Source Directory</h2>
            <p className="mt-1 text-xs text-muted">Register channels now, then connect sync jobs as credentials become available.</p>
          </div>
          <button
            onClick={addSkoolDirectorySource}
            disabled={creating || items.some(item => item.source_url === "https://www.skool.com/ourdealpartner")}
            className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            Add Skool Hub
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SOURCE_DIRECTORY.map(source => (
            <div key={source.type} className="rounded-lg border border-soft bg-base p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-text">{source.label}</p>
                  <p className="mt-1 text-xs text-muted">{source.description}</p>
                </div>
                <span className="rounded-full border border-soft bg-soft/30 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
                  {source.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <button onClick={() => setSourceFilter(source.type)} className="text-accent hover:underline">
                  View {contentStats.sourceCounts[source.type] || 0} items
                </button>
                {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="text-muted hover:text-text">Open source</a> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search title, source, URL, or description"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select
            value={sourceFilter}
            onChange={event => setSourceFilter(event.target.value as ContentSourceType | "all")}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60"
          >
            <option value="all">All sources</option>
            {SOURCE_DIRECTORY.map(source => (
              <option key={source.type} value={source.type}>{source.label}</option>
            ))}
          </select>
        </div>
      </section>

      {loading ? <p className="text-muted">Loading content...</p> : null}
      {error ? <p className="text-red-300">{error}</p> : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <div className="rounded-lg border border-soft bg-panel p-6 text-sm text-muted">
          <p>No content matches this view. Add the Skool hub, connect a channel, or add a source URL manually.</p>
        </div>
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <section className="grid gap-4">
          {filteredItems.map((item, idx) => (
            <div key={item.id} style={{ animationDelay: `${idx * 80}ms` }}>
              <ContentCard
                item={item}
                targets={targetsByContent[item.id] ?? []}
                followups={followupsByContent[item.id]?.steps ?? []}
                stats={statsByContent[item.id]}
                loadingTargets={Boolean(loadingTargets[item.id])}
                loadingFollowups={Boolean(loadingFollowups[item.id])}
                onViewTargets={onViewTargets}
                onViewFollowups={onViewFollowups}
                onSendMessage={onSendMessage}
                onBulkSend={onBulkSend}
                onMarkEngagement={onMarkEngagement}
              />
            </div>
          ))}
        </section>
      ) : null}

      <AddContentModal
        open={showAddModal}
        creating={creating}
        error={createError}
        onClose={() => {
          setCreateError("");
          setShowAddModal(false);
        }}
        onSubmit={onCreateContent}
      />
    </main>
  );
}
