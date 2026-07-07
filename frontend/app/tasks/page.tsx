"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { resolveApiUrl } from "@/components/api";
import type { Contact, FollowUpTask, OutboxMessage, TeamMember, TeamOverview } from "@/components/types";

const emptyTaskForm = {
  title: "",
  contact_id: "",
  assigned_to_user_id: "",
  priority: "normal",
  due_date: "",
  description: "",
  suggested_message: "",
};

const emptyComposerForm = {
  subject: "",
  body: "",
  to_email: "",
  to_name: "",
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
  const [composerTask, setComposerTask] = useState<FollowUpTask | null>(null);
  const [composerMessageId, setComposerMessageId] = useState("");
  const [composerForm, setComposerForm] = useState(emptyComposerForm);
  const [outboxMessages, setOutboxMessages] = useState<OutboxMessage[]>([]);
  const [form, setForm] = useState(emptyTaskForm);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: "200" });
      if (ownerFilter) params.set("assigned_to_user_id", ownerFilter);

      const [taskRes, allTaskRes, contactRes, teamRes, outboxRes] = await Promise.all([
        fetch(`${API_URL}/tasks?${params}`, { cache: "no-store" }),
        fetch(`${API_URL}/tasks?status=all&limit=500`, { cache: "no-store" }),
        fetch(`${API_URL}/contacts?limit=500`, { cache: "no-store" }),
        fetch(`${API_URL}/team`, { cache: "no-store" }),
        fetch(`${API_URL}/outbox?status=all&limit=500`, { cache: "no-store" }),
      ]);

      if (!taskRes.ok) throw new Error("Could not load tasks");
      setTasks((await taskRes.json()) as FollowUpTask[]);
      setAllTasks(allTaskRes.ok ? ((await allTaskRes.json()) as FollowUpTask[]) : []);
      setContacts(contactRes.ok ? ((await contactRes.json()) as Contact[]) : []);
      setOutboxMessages(outboxRes.ok ? ((await outboxRes.json()) as OutboxMessage[]) : []);
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

  const outboxByTask = useMemo(() => {
    return outboxMessages.reduce<Record<string, OutboxMessage[]>>((acc, message) => {
      if (!message.task_id) return acc;
      acc[message.task_id] = [...(acc[message.task_id] || []), message];
      return acc;
    }, {});
  }, [outboxMessages]);

  const contactById = useMemo(() => {
    return contacts.reduce<Record<string, Contact>>((acc, contact) => {
      acc[contact.id] = contact;
      return acc;
    }, {});
  }, [contacts]);

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

  const openComposer = (task: FollowUpTask, existingDraft?: OutboxMessage) => {
    const contact = task.contact_id ? contactById[task.contact_id] : null;
    setError("");
    setComposerTask(task);
    setComposerMessageId(existingDraft?.id || "");
    setComposerForm({
      subject: existingDraft?.subject || `Following up${task.contact_name ? ` with ${task.contact_name}` : ""}`,
      body: existingDraft?.body || task.suggested_message || task.description || "",
      to_email: existingDraft?.to_email || contact?.email || "",
      to_name: existingDraft?.to_name || task.contact_name || "",
    });
  };

  const submitComposer = async (sendNow: boolean) => {
    if (!composerTask) return;
    if (!composerForm.subject.trim() || !composerForm.body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const draftRes = await fetch(composerMessageId ? `${API_URL}/outbox/${composerMessageId}` : `${API_URL}/outbox`, {
        method: composerMessageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(composerMessageId ? {} : {
            task_id: composerTask.id,
            relationship_id: composerTask.relationship_id,
            contact_id: composerTask.contact_id,
          }),
          to_email: composerForm.to_email.trim() || null,
          to_name: composerForm.to_name.trim() || null,
          subject: composerForm.subject.trim(),
          body: composerForm.body.trim(),
          status: sendNow ? "ready" : "draft",
          metadata_json: { source: "task_center" },
        }),
      });
      if (!draftRes.ok) {
        const body = await draftRes.json().catch(() => ({}));
        throw new Error(body.detail || "Could not create email draft");
      }
      let message = (await draftRes.json()) as OutboxMessage;
      if (sendNow) {
        const sendRes = await fetch(`${API_URL}/outbox/${message.id}/send`, { method: "POST" });
        if (!sendRes.ok) {
          const body = await sendRes.json().catch(() => ({}));
          throw new Error(body.detail || "Could not send email");
        }
        message = (await sendRes.json()) as OutboxMessage;
        if (message.status === "failed") {
          throw new Error(message.error_message || "Email send failed");
        }
      }
      setComposerTask(null);
      setComposerMessageId("");
      setComposerForm(emptyComposerForm);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process email");
    } finally {
      setSaving(false);
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
        <div className="grid grid-cols-[minmax(220px,1fr)_160px_150px_130px_150px_170px] gap-3 border-b border-soft px-4 py-3 text-xs uppercase tracking-wide text-muted">
          <span>Task</span>
          <span>Owner</span>
          <span>Due</span>
          <span>Priority</span>
          <span>Email</span>
          <span>Actions</span>
        </div>
        {loading ? <p className="p-4 text-sm text-muted">Loading tasks...</p> : null}
        {!loading && visibleTasks.length === 0 ? (
          <div className="p-5">
            <p className="text-sm font-semibold text-text">No tasks match this view yet.</p>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Tasks are created from assistant actions, meeting action items, content follow-ups, and dashboard next-best touches. Once work exists, this becomes the team&apos;s ownership queue.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/dashboard" className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text hover:brightness-110">Open Command Center</Link>
              <Link href="/meetings" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Capture Meeting Notes</Link>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40"
              >
                Add Task
              </button>
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-soft">
          {visibleTasks.map(task => {
            const taskMessages = outboxByTask[task.id] || [];
            const latestMessage = taskMessages[0];
            const draftMessage = taskMessages.find(message => message.status !== "sent");
            return (
            <article key={task.id} className="grid grid-cols-[minmax(220px,1fr)_160px_150px_130px_150px_170px] items-start gap-3 px-4 py-4 text-sm">
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
              <div>
                {latestMessage ? (
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${
                      latestMessage.status === "sent"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : latestMessage.status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-soft bg-white text-muted"
                    }`}
                  >
                    {latestMessage.status}
                  </span>
                ) : (
                  <span className="text-xs text-muted">No draft</span>
                )}
                {latestMessage?.error_message ? <p className="mt-1 text-[11px] text-red-700">{latestMessage.error_message}</p> : null}
                {latestMessage?.sent_at ? <p className="mt-1 text-[11px] text-muted">{dueLabel(latestMessage.sent_at)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {task.status !== "completed" ? (
                  <button
                    type="button"
                    onClick={() => openComposer(task, draftMessage)}
                    disabled={busyTaskId === task.id}
                    className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40 disabled:opacity-50"
                  >
                    Draft Email
                  </button>
                ) : null}
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
            );
          })}
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

      {composerTask ? (
        <div className="fixed inset-0 z-50 bg-text/45 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            className="mx-auto mt-8 grid max-w-3xl gap-4 rounded-lg border border-soft bg-panel p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-accent">Outbound follow-up</p>
                <h3 className="mt-1 text-xl font-semibold text-text">Draft Email</h3>
                <p className="mt-1 text-sm text-muted">{composerTask.contact_name || "No contact linked"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComposerTask(null);
                  setComposerMessageId("");
                  setComposerForm(emptyComposerForm);
                }}
                className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft/40"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                To email
                <input
                  value={composerForm.to_email}
                  onChange={event => setComposerForm(prev => ({ ...prev, to_email: event.target.value }))}
                  placeholder="contact@example.com"
                  className="rounded-md border border-soft bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                To name
                <input
                  value={composerForm.to_name}
                  onChange={event => setComposerForm(prev => ({ ...prev, to_name: event.target.value }))}
                  placeholder="Contact name"
                  className="rounded-md border border-soft bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Subject
              <input
                value={composerForm.subject}
                onChange={event => setComposerForm(prev => ({ ...prev, subject: event.target.value }))}
                placeholder="Following up"
                className="rounded-md border border-soft bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Message
              <textarea
                value={composerForm.body}
                onChange={event => setComposerForm(prev => ({ ...prev, body: event.target.value }))}
                placeholder="Write the follow-up..."
                className="h-56 resize-none rounded-md border border-soft bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
              />
            </label>
            <p className="rounded-md border border-soft bg-white p-3 text-xs text-muted">
              Save a draft for review, or send now when the workspace email connection is ready.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => submitComposer(false)}
                disabled={saving}
                className="rounded-md border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={() => submitComposer(true)}
                disabled={saving}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"
              >
                {saving ? "Sending..." : "Send Now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
