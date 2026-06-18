"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import CampaignProofPanel from "@/components/CampaignProofPanel";
import DashboardList from "@/components/DashboardList";
import DemoGuide from "@/components/DemoGuide";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS } from "@/components/roleTaxonomy";
import { CampaignInsights, EventItem, PriorityItem, ScoreExplanation } from "@/components/types";

type RelationshipFormState = {
  firstName: string;
  lastName: string;
  type: string;
  interests: string;
  currentStatus: "cold" | "active" | "hot" | "past_deal";
  lastInteractionTiming: "today" | "this_week" | "stale";
  ownerUserId: string;
};

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const eventSchedule = (event: EventItem) => {
  if (event.day_of_week === null) {
    return `One-time at ${event.time_of_day}`;
  }
  return `${dayLabels[event.day_of_week]} at ${event.time_of_day}`;
};

export default function DashboardPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [explanations, setExplanations] = useState<Record<string, ScoreExplanation>>({});
  const [loadingExplanation, setLoadingExplanation] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [campaignInsights, setCampaignInsights] = useState<CampaignInsights | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("Who should I focus on next, and what should I say?");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<RelationshipFormState>({
    firstName: "",
    lastName: "",
    type: "lead",
    interests: "",
    currentStatus: "active",
    lastInteractionTiming: "stale",
    ownerUserId: "",
  });

  const fetchPriorities = useCallback(async (): Promise<PriorityItem[]> => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/dashboard/priorities?limit=10`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load priorities");
      }
      const data = (await res.json()) as PriorityItem[];
      setItems(data);
      setExplanations({});
      setLoadingExplanation({});
      const eventsRes = await fetch(`${API_URL}/events`, { cache: "no-store" });
      if (eventsRes.ok) {
        const eventRows = (await eventsRes.json()) as EventItem[];
        setEvents(eventRows.slice(0, 8));
      }
      const insightsRes = await fetch(`${API_URL}/relateos/campaign-insights`, { cache: "no-store" });
      if (insightsRes.ok) {
        const insightPayload = (await insightsRes.json()) as CampaignInsights;
        setCampaignInsights(insightPayload);
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const askAssistant = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setAssistantError("");
    setAssistantAnswer("");

    const target = items[0];
    if (!target) {
      setAssistantError("Add a relationship first so Teifke AI has live context to work from.");
      return;
    }

    setAssistantLoading(true);
    try {
      const res = await fetch(`${API_URL}/ai/message/${target.relationship_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: assistantPrompt.trim() || "Recommend the next best relationship action.",
          style_profile: {
            tone: "direct",
            length: "short",
            energy: "medium",
            emoji_usage: "none",
          },
        }),
      });
      if (!res.ok) {
        throw new Error("Teifke AI could not generate a response.");
      }
      const payload = (await res.json()) as { content: string };
      setAssistantAnswer(payload.content);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Teifke AI could not generate a response.");
    } finally {
      setAssistantLoading(false);
    }
  };

  useEffect(() => {
    fetchPriorities();
  }, [fetchPriorities]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const currentIds = new Set(items.map((item) => item.relationship_id));
      const next = new Set(Array.from(prev).filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const onSimulateSend = async (relationshipId: string, message: string) => {
    await fetch(`${API_URL}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationship_id: relationshipId,
        type: "note",
        content: message,
        summary: "Message simulated from dashboard",
        sentiment: 0.8
      })
    });
    await fetchPriorities();
  };

  const onLoadExplanation = async (relationshipId: string) => {
    if (explanations[relationshipId] || loadingExplanation[relationshipId]) {
      return;
    }

    setLoadingExplanation((prev) => ({ ...prev, [relationshipId]: true }));
    try {
      const res = await fetch(`${API_URL}/dashboard/score-explanation/${relationshipId}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load score explanation");
      }
      const data = (await res.json()) as ScoreExplanation;
      setExplanations((prev) => ({ ...prev, [relationshipId]: data }));
    } finally {
      setLoadingExplanation((prev) => ({ ...prev, [relationshipId]: false }));
    }
  };

  const onToggleSelect = (relationshipId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(relationshipId)) {
        next.delete(relationshipId);
      } else {
        next.add(relationshipId);
      }
      return next;
    });
  };

  const onToggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.relationship_id)));
  };

  const onDeleteRelationship = async (relationshipId: string) => {
    setDeleteError("");
    if (!window.confirm("Delete this relationship card? This cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/relationships/${relationshipId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete relationship");
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(relationshipId);
        return next;
      });
      await fetchPriorities();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete relationship");
    } finally {
      setDeleting(false);
    }
  };

  const onDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setDeleteError("");
    if (!window.confirm(`Delete ${selectedIds.size} selected relationship(s)? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/relationships`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship_ids: Array.from(selectedIds),
          delete_all: false,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to delete selected relationships");
      }

      setSelectedIds(new Set());
      await fetchPriorities();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete selected relationships");
    } finally {
      setDeleting(false);
    }
  };

  const onCreateRelationship = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!form.firstName.trim() || !form.lastName.trim() || !form.interests.trim()) {
      setCreateError("First name, last name, role, interests, status, and last interaction are required.");
      return;
    }

    setCreating(true);
    const normalizedFirstName = form.firstName.trim().toLowerCase();
    const normalizedLastName = form.lastName.trim().toLowerCase();
    const normalizedType = form.type.trim().toLowerCase();
    const previousCount = items.length;
    const previousIds = new Set(items.map((item) => item.relationship_id));

    const clearCreateForm = () => {
      setCreateError("");
      setForm({
        firstName: "",
        lastName: "",
        type: "lead",
        interests: "",
        currentStatus: "active",
        lastInteractionTiming: "stale",
        ownerUserId: "",
      });
      setShowCreateForm(false);
    };
    try {
      const res = await fetch(`${API_URL}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: null,
            phone: null,
            tags: {},
            metadata: {},
          },
          type: form.type,
          interests: form.interests.trim(),
          current_status: form.currentStatus,
          last_interaction_timing: form.lastInteractionTiming,
          owner_user_id: form.ownerUserId.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create relationship");
      }

      clearCreateForm();
      await fetchPriorities();
    } catch (e) {
      const refreshed = await fetchPriorities();
      const topListChanged = refreshed.some((item) => !previousIds.has(item.relationship_id)) || refreshed.length > previousCount;

      let existsInFullList = false;
      try {
        const allRes = await fetch(`${API_URL}/relationships`, { cache: "no-store" });
        if (allRes.ok) {
          const allRelationships = (await allRes.json()) as Array<{
            type: string;
            person: { first_name: string; last_name: string };
          }>;
          existsInFullList = allRelationships.some((rel) => {
            return (
              rel.type?.toLowerCase() === normalizedType &&
              rel.person?.first_name?.toLowerCase() === normalizedFirstName &&
              rel.person?.last_name?.toLowerCase() === normalizedLastName
            );
          });
        }
      } catch {
        existsInFullList = false;
      }

      if (topListChanged || existsInFullList) {
        clearCreateForm();
      } else {
        setCreateError(e instanceof Error ? e.message : "Failed to create relationship");
      }
    } finally {
      setCreating(false);
    }
  };

  const seedDemoData = async () => {
    setCreateError("");
    setCreating(true);
    const demoRows = [
      {
        person: { first_name: "Jordan", last_name: "Lee", email: null, phone: null, tags: {}, metadata: {} },
        type: "investor",
        interests: "duplexes in Dallas and quick close opportunities",
        current_status: "hot",
        last_interaction_timing: "stale",
        owner_user_id: "demo-owner",
      },
      {
        person: { first_name: "Avery", last_name: "Cole", email: null, phone: null, tags: {}, metadata: {} },
        type: "agent",
        interests: "off-market listings in high-growth neighborhoods",
        current_status: "active",
        last_interaction_timing: "this_week",
        owner_user_id: "demo-owner",
      },
      {
        person: { first_name: "Morgan", last_name: "Reed", email: null, phone: null, tags: {}, metadata: {} },
        type: "lead",
        interests: "first multifamily acquisition with conservative financing",
        current_status: "cold",
        last_interaction_timing: "stale",
        owner_user_id: "demo-owner",
      },
    ];

    try {
      const responses = await Promise.all(
        demoRows.map((payload) =>
          fetch(`${API_URL}/relationships`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        )
      );

      if (responses.some((res) => !res.ok)) {
        throw new Error("Failed to seed demo data");
      }

      await fetchPriorities();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to seed demo data");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <section className="mx-auto min-h-screen max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
        <header className="mb-5 rounded-lg border border-soft/70 bg-white p-4 sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">RelateOS</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">Today&apos;s Focus</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Who should you talk to today, and what should you say? Priorities are scored by relationship momentum, risk, value, and recency.
        </p>
        <p className="mt-1.5 text-xs text-muted">Your daily execution engine.</p>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setCreateError("");
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text hover:brightness-110"
          >
            Add Relationship + Context
          </button>
        </div>
        </header>

        <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Teifke AI</p>
              <h2 className="mt-1 text-base font-semibold text-text">Assistant</h2>
              <p className="mt-1 text-xs text-muted">
                Ask for a next move. The assistant uses the top priority relationship as live context.
              </p>
            </div>
            {items[0] ? (
              <span className="rounded-full border border-soft bg-soft/60 px-2.5 py-1 text-[11px] text-muted">
                Context: {items[0].name}
              </span>
            ) : null}
          </div>
          <form onSubmit={askAssistant} className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={assistantPrompt}
              onChange={(event) => setAssistantPrompt(event.target.value)}
              placeholder="Ask Teifke AI what to do next"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={assistantLoading}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assistantLoading ? "Thinking..." : "Ask Teifke AI"}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              "Who should I contact first?",
              "Write a short follow-up.",
              "What is the risk today?",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setAssistantPrompt(prompt)}
                className="rounded-full border border-soft px-2.5 py-1 text-[11px] text-muted hover:bg-soft/50 hover:text-text"
              >
                {prompt}
              </button>
            ))}
          </div>
          {assistantAnswer ? (
            <p className="mt-3 rounded-md border border-soft/70 bg-base p-3 text-sm text-text">{assistantAnswer}</p>
          ) : null}
          {assistantError ? <p className="mt-3 text-sm text-red-300">{assistantError}</p> : null}
        </section>

        {showCreateForm ? (
          <div className="fixed inset-0 z-50 bg-canvas/70 backdrop-blur-sm" role="presentation">
            <form
              onSubmit={onCreateRelationship}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-relationship-title"
              className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-soft bg-panel p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="create-relationship-title" className="text-base font-semibold text-text">Create Relationship With Context</h2>
                  <p className="mt-1 text-xs text-muted">Add the minimum context needed for scoring and a first message.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
                >
                  Close
                </button>
              </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder="First name"
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
              />
              <input
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder="Last name"
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
              />
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, type: e.target.value as RelationshipFormState["type"] }))
                }
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring sm:col-span-1"
              >
                {ROLE_OPTIONS.slice(0, 10).map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
                <option value="lead">Lead</option>
                <option value="investor">Investor</option>
                <option value="partner">Partner</option>
              </select>
              <select
                value={form.currentStatus}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    currentStatus: e.target.value as RelationshipFormState["currentStatus"],
                  }))
                }
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring sm:col-span-1"
              >
                <option value="cold">Cold</option>
                <option value="active">Active</option>
                <option value="hot">Hot</option>
                <option value="past_deal">Past deal</option>
              </select>
              <input
                value={form.interests}
                onChange={(e) => setForm((prev) => ({ ...prev, interests: e.target.value }))}
                placeholder="What are they interested in?"
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring sm:col-span-2"
              />
              <select
                value={form.lastInteractionTiming}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    lastInteractionTiming: e.target.value as RelationshipFormState["lastInteractionTiming"],
                  }))
                }
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring sm:col-span-2"
              >
                <option value="today">Last interaction: Today</option>
                <option value="this_week">Last interaction: This week</option>
                <option value="stale">Last interaction: Haven&apos;t talked in a while</option>
              </select>
              <input
                value={form.ownerUserId}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}
                placeholder="Owner user ID (optional, e.g. demo-owner)"
                className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring sm:col-span-2"
              />
            </div>

            {createError ? <p className="mt-3 text-sm text-red-300">{createError}</p> : null}

            <div className="mt-auto flex items-center gap-2 pt-5">
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft"
              >
                Cancel
              </button>
            </div>
          </form>
          </div>
        ) : null}

        {loading ? <p className="text-muted">Loading priorities...</p> : null}
        {error ? <p className="text-red-300">{error}</p> : null}
        {deleteError ? <p className="mt-2 text-red-300">{deleteError}</p> : null}

        {!loading && events.length > 0 ? (
          <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Upcoming Events</h2>
              <Link href="/events" className="text-xs text-accent hover:underline">Open Events</Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {events.map((event) => (
                <article key={event.id} className="rounded-md border border-soft/60 bg-white p-3 text-xs text-muted">
                  <p className="text-sm font-semibold text-text">{event.title}</p>
                  <p className="mt-1">{event.description}</p>
                  <p className="mt-1 font-medium text-muted">{eventSchedule(event)}</p>
                  <Link href={`/events?event_id=${encodeURIComponent(event.id)}`} className="mt-2 inline-block text-accent hover:underline">View event</Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {!loading && campaignInsights ? (
          <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">Proof View</h2>
                <p className="mt-1 text-xs text-muted">Campaign evidence stays tucked away until there is enough signal to review.</p>
              </div>
              <Link href="/relateos" className="text-xs text-accent hover:underline">Open RelateOS</Link>
            </div>
            <CampaignProofPanel insights={campaignInsights} compact />
          </section>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="rounded-lg border border-soft/70 bg-white p-5 text-sm text-muted">
            <p>Your dashboard gets smart after one contact with context. Add one now, or load sample relationships.</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={seedDemoData}
                disabled={creating}
                className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Seeding demo..." : "Load 3 Demo Relationships"}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            {selectedIds.size > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-soft/70 bg-white p-3 text-sm">
                <label className="flex items-center gap-2 text-text">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === items.length}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 rounded border-soft bg-canvas text-accent focus:ring-accent"
                  />
                  Select all visible
                </label>
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={deleting || selectedIds.size === 0}
                  className="rounded-md border border-red-400/50 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={deleting || selectedIds.size === 0}
                  className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear selection
                </button>
              </div>
            ) : null}
            <DashboardList
              items={items}
              onSimulateSend={onSimulateSend}
              explanations={explanations}
              loadingExplanation={loadingExplanation}
              onLoadExplanation={onLoadExplanation}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onDeleteRelationship={onDeleteRelationship}
              deleteDisabled={deleting}
            />
          </>
        ) : null}
      </section>
      <DemoGuide />
    </>
  );
}
