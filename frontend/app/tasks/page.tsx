"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { resolveApiUrl } from "@/components/api";
import type { Contact, FollowUpTask, TeamMember, TeamOverview } from "@/components/types";

const emptyTaskForm = {
  title: "",
  contact_id: "",
  assigned_to_user_id: "",
  priority: "normal",
  due_date: "",
  description: "",
  suggested_message: "",
};

const compactName = (contact: Contact) => {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  return name || contact.email || "Unknown contact";
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
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const isOverdue = (task: FollowUpTask) => {
  if (!task.due_at || task.status === "completed") return false;
  const due = new Date(task.due_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

const isDueToday = (task: FollowUpTask) => {
  if (!task.due_at || task.status === "completed") return false;
  const due = new Date(task.due_at);
  const today = new Date();
  return due.toDateString() === today.toDateString();
};

export default function TasksPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [allTasks, setAllTasks] = useState<FollowUpTask[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(emptyTaskForm);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: "200" });
      if (ownerFilter) params.set("assigned_to_user_id", ownerFilter);

      const [taskRes, allTaskRes, contactRes, teamRes] = await Promise.all([
        fetch(`${API_URL}/tasks?${params}`, { cache: "no-store" }),
        fetch(`${API_URL}/tasks?status=all&limit=500`, { cache: "no-store" }),
        fetch(`${API_URL}/contacts?limit=500`, { cache: "no-store" }),
        fetch(`${API_URL}/team`, { cache: "no-store" }),
      ]);

      if (!taskRes.ok) throw new Error("Could not load tasks");
      setTasks((await taskRes.json()) as FollowUpTask[]);
      setAllTasks(allTaskRes.ok ? ((await allTaskRes.json()) as FollowUpTask[]) : []);
      setContacts(contactRes.ok ? ((await contactRes.json()) as Contact[]) : []);
      if (teamRes.ok) {
        const team = (await teamRes.json()) as TeamOverview;
        setTeamMembers(team.members.filter(member => member.status === "active"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [API_URL, ownerFilter, statusFilter]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const visibleTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter(task => {
      return [
        task.title,
        task.description || "",
        task.suggested_message || "",
        task.contact_name || "",
        task.assigned_to_name || "",
        task.assigned_to_email || "",
      ].join(" ").toLowerCase().includes(term);
    });
  }, [search, tasks]);

  const stats = useMemo(() => {
    const open = allTasks.filter(task => task.status === "open").length;
    const overdue = allTasks.filter(isOverdue).length;
    const dueToday = allTasks.filter(isDueToday).length;
    const completed = allTasks.filter(task => task.status === "completed").length;
    return { open, overdue, dueToday, completed };
  }, [allTasks]);

  const selectedContact = contacts.find(contact => contact.id === form.contact_id);

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Task title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          contact_id: form.contact_id || null,
          relationship_id: selectedContact?.relationship_id || null,
          assigned_to_user_id: form.assigned_to_user_id || null,
          priority: form.priority,
          due_at: form.due_date ? new Date(`${form.due_date}T12:00:00`).toISOString() : null,
          description: form.description.trim() || null,
          suggested_message: form.suggested_message.trim() || null,
          task_type: "follow_up",
          metadata_json: { source: "task_center" },
        }),
      });
      if (!res.ok) throw new Error("Could not create task");
      setShowCreateModal(false);
      setForm(emptyTaskForm);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (task: FollowUpTask, updates: Partial<Pick<FollowUpTask, "assigned_to_user_id" | "due_at" | "priority" | "status">>) => {
    setBusyTaskId(task.id);
    setError("");
    try {
      const res = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Could not update task");
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task");
    } finally {
      setBusyTaskId("");
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Execution Queue</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Task Center</h2>
          <p className="mt-1 text-sm text-muted">Create, assign, schedule, and close relationship work across the team.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowCreateModal(true);
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110"
        >
          New Task
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["Open", stats.open],
          ["Overdue", stats.overdue],
          ["Due today", stats.dueToday],
          ["Completed", stats.completed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search task, contact, owner, or message"
            className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={ownerFilter}
            onChange={event => setOwnerFilter(event.target.value)}
            className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
          >
            <option value="">All owners</option>
            {teamMembers.map(member => (
              <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>
            ))}
          </select>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-red-300/40 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-lg border border-soft bg-panel">
        <div className="grid grid-cols-[minmax(220px,1fr)_180px_170px_150px_130px] gap-3 border-b border-soft px-4 py-3 text-xs uppercase tracking-wide text-muted">
          <span>Task</span>
          <span>Owner</span>
          <span>Due</span>
          <span>Priority</span>
          <span>Actions</span>
        </div>
        {loading ? <p className="p-4 text-sm text-muted">Loading tasks...</p> : null}
        {!loading && visibleTasks.length === 0 ? (
          <div className="p-5 text-sm text-muted">No tasks match this view.</div>
        ) : null}
        <div className="divide-y divide-soft">
          {visibleTasks.map(task => (
            <article key={task.id} className="grid grid-cols-[minmax(220px,1fr)_180px_170px_150px_130px] items-start gap-3 px-4 py-4 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text">{task.title}</p>
                  <span className="rounded-full border border-soft bg-white px-2 py-0.5 text-[11px] capitalize text-muted">{task.status}</span>
                  {isOverdue(task) ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700">Overdue</span> : null}
                </div>
                <p className="mt-1 text-xs text-muted">{task.contact_name || "No contact linked"}</p>
                {task.description ? <p className="mt-2 text-xs text-muted">{task.description}</p> : null}
                {task.suggested_message ? <p className="mt-2 rounded-md border border-soft bg-white p-2 text-xs text-text">{task.suggested_message}</p> : null}
              </div>
              <select
                value={task.assigned_to_user_id || ""}
                onChange={event => updateTask(task, { assigned_to_user_id: event.target.value || null })}
                disabled={busyTaskId === task.id}
                className="rounded-md border border-soft bg-white px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none disabled:opacity-50"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(member => (
                  <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>
                ))}
              </select>
              <div>
                <input
                  type="date"
                  value={dateInputValue(task.due_at)}
                  onChange={event => updateTask(task, { due_at: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })}
                  disabled={busyTaskId === task.id}
                  className="w-full rounded-md border border-soft bg-white px-3 py-2 text-xs text-text focus:border-accent/60 focus:outline-none disabled:opacity-50"
                />
                <p className="mt-1 text-[11px] text-muted">{dueLabel(task.due_at)}</p>
              </div>
              <select
                value={task.priority}
                onChange={event => updateTask(task, { priority: event.target.value })}
                disabled={busyTaskId === task.id}
                className="rounded-md border border-soft bg-white px-3 py-2 text-xs capitalize text-text focus:border-accent/60 focus:outline-none disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <div className="flex flex-wrap gap-2">
                {task.contact_id ? (
                  <Link href={`/contacts?contact_id=${encodeURIComponent(task.contact_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">
                    View
                  </Link>
                ) : null}
                {task.status !== "completed" ? (
                  <button
                    type="button"
                    onClick={() => updateTask(task, { status: "completed" })}
                    disabled={busyTaskId === task.id}
                    className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text disabled:opacity-50"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateTask(task, { status: "open" })}
                    disabled={busyTaskId === task.id}
                    className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 bg-text/45 p-4 backdrop-blur-sm" role="presentation">
          <form
            onSubmit={createTask}
            role="dialog"
            aria-modal="true"
            className="mx-auto mt-10 grid max-w-2xl gap-4 rounded-lg border border-soft bg-panel p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-accent">New task</p>
                <h3 className="mt-1 text-xl font-semibold text-text">Create Relationship Work</h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft/40">
                Close
              </button>
            </div>
            <input
              required
              value={form.title}
              onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
              placeholder="Task title"
              className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={form.contact_id}
                onChange={event => setForm(prev => ({ ...prev, contact_id: event.target.value }))}
                className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
              >
                <option value="">No contact</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>{compactName(contact)}</option>
                ))}
              </select>
              <select
                value={form.assigned_to_user_id}
                onChange={event => setForm(prev => ({ ...prev, assigned_to_user_id: event.target.value }))}
                className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(member => (
                  <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={event => setForm(prev => ({ ...prev, priority: event.target.value }))}
                className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
              >
                <option value="low">Low priority</option>
                <option value="normal">Normal priority</option>
                <option value="high">High priority</option>
                <option value="urgent">Urgent priority</option>
              </select>
              <input
                type="date"
                value={form.due_date}
                onChange={event => setForm(prev => ({ ...prev, due_date: event.target.value }))}
                className="rounded-md border border-soft bg-white px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
              />
            </div>
            <textarea
              value={form.description}
              onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
              placeholder="Why this needs to happen"
              className="h-24 resize-none rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <textarea
              value={form.suggested_message}
              onChange={event => setForm(prev => ({ ...prev, suggested_message: event.target.value }))}
              placeholder="Suggested message or call notes"
              className="h-28 resize-none rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-md border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
                {saving ? "Creating..." : "Create Task"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
