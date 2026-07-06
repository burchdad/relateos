"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

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

type QuickAction =
  | {
      title: string;
      detail: string;
      action: string;
      kind: "button";
    }
  | {
      title: string;
      detail: string;
      action: string;
      kind: "link";
      href: Route;
    };

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: "Add a link or file",
    detail: "Save a useful resource, transcript, recording, PDF, or article.",
    action: "Add Link or File",
    kind: "button",
  },
  {
    title: "Import Zoom notes",
    detail: "Pull meeting summaries and transcripts from connected Zoom accounts.",
    action: "Open Connections",
    kind: "link",
    href: "/connections",
  },
  {
    title: "Target contacts",
    detail: "Use content to decide who should receive what, and why now.",
    action: "View Contacts",
    kind: "link",
    href: "/contacts?intent=targets",
  },
];

const SOURCE_DIRECTORY: {
  type: ContentSourceType;
  label: string;
  status: "connected" | "not_connected" | "planned";
}[] = [
  {
    type: "upload",
    label: "Manual",
    status: "connected",
  },
  {
    type: "zoom",
    label: "Zoom",
    status: "not_connected",
  },
  {
    type: "skool",
    label: "Skool",
    status: "not_connected",
  },
  { type: "youtube", label: "YouTube", status: "planned" },
  { type: "facebook", label: "Facebook", status: "planned" },
  { type: "instagram", label: "Instagram", status: "planned" },
  { type: "podcast", label: "Podcast", status: "planned" },
];

const SOURCE_STATUS_STYLES = {
  connected: "bg-sage text-text",
  not_connected: "bg-red-500 text-red-500",
  planned: "bg-accent text-accent",
};

const SOURCE_STATUS_LABELS = {
  connected: "Connected",
  not_connected: "Not connected",
  planned: "Planned",
};

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
  const hasContent = items.length > 0;

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
          <h1 className="mt-1 text-2xl font-semibold text-text">Content Library</h1>
          <p className="text-sm text-muted mt-1">
            Organize videos, posts, recordings, transcripts, and links that can be matched to contacts and follow-ups.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110"
          >
            Add Link or File
          </button>
          <Link href="/contacts?intent=targets" className="rounded-lg border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40">
            View Targets in Contacts
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {QUICK_ACTIONS.map(item => (
          <article key={item.title} className="rounded-lg border border-soft bg-panel p-4">
            <h2 className="text-base font-semibold text-text">{item.title}</h2>
            <p className="mt-2 min-h-10 text-sm text-muted">{item.detail}</p>
            {item.kind === "button" ? (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="mt-4 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110"
              >
                {item.action}
              </button>
            ) : (
              <Link href={item.href} className="mt-4 inline-flex rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">
                {item.action}
              </Link>
            )}
          </article>
        ))}
      </section>

      {hasContent ? (
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
      ) : null}

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Source Status</h2>
            <p className="mt-1 text-xs text-muted">Connections live in the Connections tab; this row just shows what can feed the library.</p>
          </div>
          <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-xs font-medium text-text hover:bg-soft/40">
            Manage Connections
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SOURCE_DIRECTORY.map(source => (
            <button
              key={source.type}
              onClick={() => setSourceFilter(source.type)}
              className="flex min-h-11 items-center gap-2 rounded-md border border-soft bg-base px-3 py-2 text-left text-sm text-text hover:bg-soft/30"
              title={SOURCE_STATUS_LABELS[source.status]}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${SOURCE_STATUS_STYLES[source.status]}`}
                aria-hidden="true"
              />
              <span className="font-semibold">{source.label}</span>
              <span className="text-xs text-muted">{contentStats.sourceCounts[source.type] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">What Happens Next</h2>
            <p className="mt-1 text-xs text-muted">
              Content becomes useful once it is understood and matched to the right relationships.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
              Open Connections
            </Link>
            <Link href="/settings" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
              Profile Settings
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {[
            { step: "1", title: "Add or import content", detail: "Save a link, transcript, recording, file, or meeting note." },
            { step: "2", title: "Generate insight", detail: "RelateOS turns the asset into key points, context, and usable angles." },
            { step: "3", title: "Match to contacts", detail: "The best-fit people and follow-up reasons surface when there is enough signal." },
          ].map(item => (
            <article key={item.step} className="rounded-lg border border-soft bg-base p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-text">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-text">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted">{item.detail}</p>
                </div>
              </div>
            </article>
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
          <p className="font-semibold text-text">Your content library is ready for its first item.</p>
          <p className="mt-2">
            Start with a meeting transcript, Zoom summary, useful link, PDF, or sales resource. RelateOS can use it to suggest who should receive it and why.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110"
            >
              Add Link or File
            </button>
            <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">
              Connect Sources
            </Link>
          </div>
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
