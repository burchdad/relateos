"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import CampaignProofPanel from "@/components/CampaignProofPanel";
import DashboardList from "@/components/DashboardList";
import DemoGuide from "@/components/DemoGuide";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS } from "@/components/roleTaxonomy";
import { CampaignInsights, EventItem, FollowUpQueueItem, FollowUpTask, MorningBrief, PriorityItem, ScoreExplanation, TeamMember, TeamOverview } from "@/components/types";

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

const dateInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const dueLabel = (value: string | null) => {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const shortDateTime = (value: string | null | undefined) => {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced yet";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function DashboardPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [morningBrief, setMorningBrief] = useState<MorningBrief | null>(null);
  const [followups, setFollowups] = useState<FollowUpQueueItem[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState("open");
  const [taskOwnerFilter, setTaskOwnerFilter] = useState("");
  const [taskBusyId, setTaskBusyId] = useState("");
  const [taskError, setTaskError] = useState("");
  const [explanations, setExplanations] = useState<Record<string, ScoreExplanation>>({});
  const [loadingExplanation, setLoadingExplanation] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [campaignInsights, setCampaignInsights] = useState<CampaignInsights | null>(null);
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
      const briefRes = await fetch(`${API_URL}/dashboard/morning-brief?limit=5`, { cache: "no-store" });
      if (briefRes.ok) {
        setMorningBrief((await briefRes.json()) as MorningBrief);
      }
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
      const followupsRes = await fetch(`${API_URL}/dashboard/followups?limit=10`, { cache: "no-store" });
      if (followupsRes.ok) {
        setFollowups((await followupsRes.json()) as FollowUpQueueItem[]);
      }
      const teamRes = await fetch(`${API_URL}/team`, { cache: "no-store" });
      if (teamRes.ok) {
        const payload = (await teamRes.json()) as TeamOverview;
        setTeamMembers(payload.members.filter(member => member.status === "active"));
      }
      const taskParams = new URLSearchParams({ status: taskStatusFilter, limit: "25" });
      if (taskOwnerFilter) taskParams.set("assigned_to_user_id", taskOwnerFilter);
      const tasksRes = await fetch(`${API_URL}/tasks?${taskParams}`, { cache: "no-store" });
      if (tasksRes.ok) {
        setTasks((await tasksRes.json()) as FollowUpTask[]);
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [API_URL, taskOwnerFilter, taskStatusFilter]);

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

  const onCreateTaskFromFollowup = async (item: FollowUpQueueItem) => {
    setTaskError("");
    setTaskBusyId(item.relationship_id);
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship_id: item.relationship_id,
          contact_id: item.contact_id,
          title: `Follow up with ${item.name}`,
          description: item.why_now,
          suggested_message: item.suggested_message,
          priority: item.urgency_level === "Act Today" ? "high" : "normal",
          task_type: "follow_up",
          metadata_json: {
            source: "dashboard_followup_queue",
            reason_tag: item.reason_tag,
            signal_reasons: item.signal_reasons,
          },
        }),
      });
      if (!res.ok) throw new Error("Could not create task");
      await fetchPriorities();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not create task");
    } finally {
      setTaskBusyId("");
    }
  };

  const onCompleteTask = async (task: FollowUpTask) => {
    setTaskError("");
    setTaskBusyId(task.id);
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("Could not complete task");
      await fetchPriorities();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not complete task");
    } finally {
      setTaskBusyId("");
    }
  };

  const onUpdateTask = async (task: FollowUpTask, updates: Partial<Pick<FollowUpTask, "assigned_to_user_id" | "due_at" | "status" | "priority">>) => {
    setTaskError("");
    setTaskBusyId(task.id);
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Could not update task");
      await fetchPriorities();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not update task");
    } finally {
      setTaskBusyId("");
    }
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-accent">RelateOS</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">Today&apos;s Command Center</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Start here: the clearest people to contact, why now, the message angle, and the work already waiting on the team.
              </p>
              <p className="mt-1.5 text-xs text-muted">Brief generated {shortDateTime(morningBrief?.generated_at)}.</p>
            </div>
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

        {!loading ? (
          <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Morning brief</p>
                <h2 className="mt-1 text-xl font-semibold text-text">{morningBrief?.headline || "Build today's relationship plan"}</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-soft bg-base p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Top people</p>
                    <p className="mt-1 text-2xl font-semibold text-text">{morningBrief?.focus_count || 0}</p>
                  </div>
                  <div className="rounded-md border border-soft bg-base p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Open tasks</p>
                    <p className="mt-1 text-2xl font-semibold text-text">{morningBrief?.open_task_count || 0}</p>
                  </div>
                  <div className="rounded-md border border-soft bg-base p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Overdue</p>
                    <p className="mt-1 text-2xl font-semibold text-text">{morningBrief?.overdue_task_count || 0}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-soft bg-base p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Next best setup</p>
                <div className="mt-2 grid gap-2 text-xs text-muted">
                  {(morningBrief?.next_steps || []).slice(0, 3).map((step) => (
                    <p key={step}>{step}</p>
                  ))}
                </div>
              </div>
            </div>

            {morningBrief?.items.length ? (
              <div className="mt-4 grid gap-2">
                {morningBrief.items.map((item, index) => (
                  <article key={item.relationship_id} className="grid gap-3 rounded-md border border-soft bg-base p-3 lg:grid-cols-[44px_minmax(180px,0.65fr)_minmax(0,1fr)_auto]">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-soft bg-white text-sm font-semibold text-accent">{index + 1}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-text">{item.name}</p>
                        <span className="rounded-full border border-soft bg-white px-2 py-0.5 text-[11px] text-muted">{item.urgency_level}</span>
                      </div>
                      <p className="mt-1 text-xs text-accent">{item.recommended_action}</p>
                      <p className="mt-1 text-xs text-muted">Score {item.priority_score.toFixed(1)} · {item.reason_tag}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted">{item.why_now}</p>
                      {item.suggested_message ? (
                        <p className="mt-2 rounded-md border border-soft bg-white p-2 text-sm text-text">{item.suggested_message}</p>
                      ) : null}
                    </div>
                    <div className="flex items-start gap-2 lg:justify-end">
                      {item.contact_id ? (
                        <Link href={`/contacts?contact_id=${encodeURIComponent(item.contact_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
                          View
                        </Link>
                      ) : null}
                      {item.suggested_message ? (
                        <button
                          type="button"
                          onClick={() => onSimulateSend(item.relationship_id, item.suggested_message || "")}
                          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text hover:brightness-110"
                        >
                          Log Touch
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-soft bg-base p-4">
                <h3 className="text-base font-semibold text-text">Your command center is ready for real relationship data.</h3>
                <p className="mt-1 text-sm text-muted">
                  Import contacts, connect Google Contacts, or load a short demo set to see priorities, reasons, and suggested messages.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/imports" className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110">Import Contacts</Link>
                  <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Connect Sources</Link>
                  <button
                    type="button"
                    onClick={seedDemoData}
                    disabled={creating}
                    className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40 disabled:opacity-60"
                  >
                    {creating ? "Loading demo..." : "Load Demo Data"}
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {!loading ? (
          <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Task inbox</p>
                <h2 className="mt-1 text-base font-semibold text-text">Open Relationship Work</h2>
                <p className="mt-1 text-xs text-muted">Assigned follow-ups, content sends, calls, and meeting next steps live here before they become automations.</p>
              </div>
              <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs text-muted">{tasks.length} shown</span>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-[160px_220px_minmax(0,1fr)]">
              <select
                value={taskStatusFilter}
                onChange={(event) => setTaskStatusFilter(event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="completed">Completed</option>
                <option value="all">All statuses</option>
              </select>
              <select
                value={taskOwnerFilter}
                onChange={(event) => setTaskOwnerFilter(event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none"
              >
                <option value="">All owners</option>
                {teamMembers.map(member => (
                  <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>
                ))}
              </select>
              <p className="self-center text-xs text-muted">Use this as the daily operating queue for the team.</p>
            </div>
            {taskError ? <p className="mb-3 text-sm text-red-300">{taskError}</p> : null}
            {tasks.length === 0 ? (
              <div className="rounded-md border border-soft bg-base p-4">
                <p className="text-sm font-semibold text-text">No relationship work is waiting right now.</p>
                <p className="mt-1 text-sm text-muted">
                  Tasks appear when the assistant creates follow-ups, meeting notes produce action items, content is targeted to contacts, or someone assigns work from the command center.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/tasks" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Open Tasks</Link>
                  <Link href="/meetings" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Capture Meeting Notes</Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {tasks.slice(0, 6).map((task) => (
                  <article key={task.id} className="grid gap-3 rounded-md border border-soft/70 bg-base p-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1fr)_minmax(220px,0.65fr)_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-text">{task.title}</p>
                        <span className="rounded-full border border-soft bg-white px-2 py-0.5 text-[11px] capitalize text-muted">{task.priority}</span>
                        <span className="rounded-full border border-soft bg-white px-2 py-0.5 text-[11px] capitalize text-muted">{task.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{task.contact_name || "No contact linked"}</p>
                      <p className="mt-1 text-xs text-muted">Due: {dueLabel(task.due_at)}</p>
                    </div>
                    <div>
                      {task.description ? <p className="text-xs font-medium text-muted">{task.description}</p> : null}
                      {task.suggested_message ? (
                        <p className="mt-2 rounded-md border border-soft bg-white p-2 text-sm text-text">{task.suggested_message}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <select
                        value={task.assigned_to_user_id || ""}
                        onChange={(event) => onUpdateTask(task, { assigned_to_user_id: event.target.value || null })}
                        disabled={taskBusyId === task.id}
                        className="rounded-md border border-soft bg-white px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map(member => (
                          <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={dateInputValue(task.due_at)}
                        onChange={(event) => onUpdateTask(task, { due_at: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })}
                        disabled={taskBusyId === task.id}
                        className="rounded-md border border-soft bg-white px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                    <div className="flex items-start gap-2 lg:justify-end">
                      {task.contact_id ? (
                        <Link href={`/contacts?contact_id=${encodeURIComponent(task.contact_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
                          View
                        </Link>
                      ) : null}
                      {task.status !== "completed" ? (
                        <button
                          type="button"
                          onClick={() => onCompleteTask(task)}
                          disabled={taskBusyId === task.id}
                          className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text hover:brightness-110 disabled:opacity-50"
                        >
                          {taskBusyId === task.id ? "Closing..." : "Complete"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && followups.length > 0 ? (
          <section className="mb-4 rounded-lg border border-soft/70 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Follow-up queue</p>
                <h2 className="mt-1 text-base font-semibold text-text">Next Best Touches</h2>
                <p className="mt-1 text-xs text-muted">A live queue built from relationship score, signals, recency, and meeting/content activity.</p>
              </div>
              <Link href="/contacts" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Open Contacts</Link>
            </div>
            <div className="grid gap-2">
              {followups.slice(0, 5).map((item) => (
                <article key={item.relationship_id} className="grid gap-3 rounded-md border border-soft/70 bg-base p-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(0,1fr)_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-text">{item.name}</p>
                      <span className="rounded-full border border-soft bg-white px-2 py-0.5 text-[11px] text-muted">{item.urgency_level}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {item.days_since_contact == null ? "No contact logged yet" : `Last touch ${item.days_since_contact} days ago`}
                    </p>
                    <p className="mt-1 text-xs text-accent">{item.reason_tag}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted">{item.why_now}</p>
                    {item.suggested_message ? (
                      <p className="mt-2 rounded-md border border-soft bg-white p-2 text-sm text-text">{item.suggested_message}</p>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-2 lg:justify-end">
                    {item.contact_id ? (
                      <Link href={`/contacts?contact_id=${encodeURIComponent(item.contact_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
                        View
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onCreateTaskFromFollowup(item)}
                      disabled={taskBusyId === item.relationship_id}
                      className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40 disabled:opacity-50"
                    >
                      {taskBusyId === item.relationship_id ? "Creating..." : "Create Task"}
                    </button>
                    {item.suggested_message ? (
                      <button
                        type="button"
                        onClick={() => onSimulateSend(item.relationship_id, item.suggested_message || "")}
                        className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text hover:brightness-110"
                      >
                        Log Touch
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
