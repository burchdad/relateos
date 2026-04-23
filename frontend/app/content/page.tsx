"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AddContentModal from "@/components/AddContentModal";
import AppTabs from "@/components/AppTabs";
import ContentCard from "@/components/ContentCard";
import { resolveApiUrl } from "@/components/api";
import { ContentFollowUpResponse, ContentItem, ContentTarget, FollowUpExecuteResponse } from "@/components/types";

type LoadingMap = Record<string, boolean>;

export default function ContentPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [targetsByContent, setTargetsByContent] = useState<Record<string, ContentTarget[]>>({});
  const [followupsByContent, setFollowupsByContent] = useState<Record<string, ContentFollowUpResponse>>({});
  const [loadingTargets, setLoadingTargets] = useState<LoadingMap>({});
  const [loadingFollowups, setLoadingFollowups] = useState<LoadingMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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
    source_type: "youtube" | "zoom" | "upload";
    source_url: string;
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
    if (data.dispatch_mode === "immediate") {
      await onViewTargets(contentId, true);
    }
    return {
      executedCount: data.executed_count,
      queuedCount: data.queued_count,
      mode: data.dispatch_mode,
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
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Content Engine</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Decide what content to share, who should receive it, and when to follow up.
        </p>
        <div className="mt-4">
          <AppTabs />
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110"
        >
          Add Content
        </button>
      </header>

      {loading ? <p className="text-muted">Loading content...</p> : null}
      {error ? <p className="text-red-300">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-2xl border border-soft bg-panel/50 p-6 text-sm text-muted">
          <p>Paste a YouTube or Zoom link to generate summary, target relationships, and follow-up sequence.</p>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="grid gap-4">
          {items.map((item, idx) => (
            <div key={item.id} style={{ animationDelay: `${idx * 80}ms` }}>
              <ContentCard
                item={item}
                targets={targetsByContent[item.id] ?? []}
                followups={followupsByContent[item.id]?.steps ?? []}
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
