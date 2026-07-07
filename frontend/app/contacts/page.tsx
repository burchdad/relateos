"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS, formatRole } from "@/components/roleTaxonomy";
import type { Contact, FollowUpTask, TimelineItem } from "@/components/types";

const STAGES = ["new", "aware", "engaged", "active", "partner", "dormant", "high_value"];
const TAG_OPTIONS = [
  { value: "investor", label: "Investor" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "broker", label: "Broker" },
  { value: "agent", label: "Agent" },
  { value: "lender", label: "Lender" },
  { value: "vendor", label: "Vendor" },
  { value: "partner", label: "Partner" },
  { value: "event_invite", label: "Event Invite" },
  { value: "high_touch", label: "High Touch" },
];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  primary_role: "",
  source: "",
  relationship_stage: "",
  notes_summary: "",
  tag_keys: [] as string[],
};

const emptyContentEmailForm = {
  subject: "",
  message: "",
  photoUrls: "",
  videoUrls: "",
  contentUrls: "",
  recordingLinks: "",
};

type ContactForm = typeof emptyForm;
type ContactTextField = keyof Pick<ContactForm, "first_name" | "last_name" | "email" | "phone">;

const CONTACT_TEXT_FIELDS: Array<[ContactTextField, string, boolean]> = [
  ["first_name", "First name", true],
  ["last_name", "Last name", true],
  ["email", "Email", false],
  ["phone", "Phone", false],
];

const compactName = (contact: Contact) => {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  return name || contact.email || "Unknown contact";
};

const initialsFor = (contact: Contact) => compactName(contact).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

const tagKeysFor = (tags: Record<string, unknown> | null | undefined) => {
  if (!tags) return [];
  const labels = Array.isArray(tags.labels) ? tags.labels.map(String) : [];
  const keyedTags = Object.entries(tags)
    .filter(([key, value]) => key !== "labels" && Boolean(value))
    .map(([key]) => key);
  return Array.from(new Set([...labels, ...keyedTags]));
};

const tagLabelFor = (tag: string) => TAG_OPTIONS.find(option => option.value === tag)?.label || tag.replace(/_/g, " ");

const timelineDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const taskDueLabel = (value: string | null) => {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function ContactsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");
  const [selectedRelationshipIds, setSelectedRelationshipIds] = useState<Set<string>>(new Set());
  const [showContentModal, setShowContentModal] = useState(false);
  const [contentEmailForm, setContentEmailForm] = useState(emptyContentEmailForm);
  const [intent, setIntent] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [loggingNote, setLoggingNote] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [contactTasks, setContactTasks] = useState<FollowUpTask[]>([]);
  const [taskBusyId, setTaskBusyId] = useState("");

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (stageFilter) params.set("relationship_stage", stageFilter);
      const res = await fetch(`${API_URL}/contacts?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as Contact[];
        setContacts(data);
        const requestedContactId =
          typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("contact_id") : null;
        setSelectedContact((current) => {
          if (requestedContactId) return data.find(contact => contact.id === requestedContactId) || data[0] || null;
          return current ? data.find(contact => contact.id === current.id) || current : data[0] || null;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL, roleFilter, search, stageFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const fetchTimeline = useCallback(async (contactId: string) => {
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const res = await fetch(`${API_URL}/contacts/${contactId}/timeline`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load relationship memory");
      setTimeline((await res.json()) as TimelineItem[]);
    } catch (error) {
      setTimeline([]);
      setTimelineError(error instanceof Error ? error.message : "Could not load relationship memory");
    } finally {
      setTimelineLoading(false);
    }
  }, [API_URL]);

  const fetchContactTasks = useCallback(async (contactId: string) => {
    try {
      const res = await fetch(`${API_URL}/tasks?status=open&contact_id=${encodeURIComponent(contactId)}&limit=10`, { cache: "no-store" });
      setContactTasks(res.ok ? ((await res.json()) as FollowUpTask[]) : []);
    } catch {
      setContactTasks([]);
    }
  }, [API_URL]);

  const selectedContactId = selectedContact?.id;

  useEffect(() => {
    if (!selectedContactId) {
      setTimeline([]);
      setContactTasks([]);
      return;
    }
    fetchTimeline(selectedContactId);
    fetchContactTasks(selectedContactId);
  }, [fetchContactTasks, fetchTimeline, selectedContactId]);

  useEffect(() => {
    if (!selectedContact || editingContact) return;
    setEditForm({
      first_name: selectedContact.first_name || "",
      last_name: selectedContact.last_name || "",
      email: selectedContact.email || "",
      phone: selectedContact.phone || "",
      primary_role: selectedContact.primary_role || "",
      source: selectedContact.source || "",
      relationship_stage: selectedContact.relationship_stage || "",
      notes_summary: selectedContact.notes_summary || selectedContact.relationship_interests || "",
      tag_keys: tagKeysFor(selectedContact.tags),
    });
  }, [editingContact, selectedContact]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    setIntent(url.searchParams.get("intent") || "");
    const relationshipIds = url.searchParams.get("relationship_ids");
    if (relationshipIds) {
      setSelectedRelationshipIds(new Set(relationshipIds.split(",").map(id => id.trim()).filter(Boolean)));
    }
  }, []);

  const stats = useMemo(() => {
    const withEmail = contacts.filter(c => c.email).length;
    const priority = contacts.filter(c => (c.priority_score || 0) >= 70).length;
    const active = contacts.filter(c => ["active", "partner", "high_value"].includes(c.relationship_stage || "")).length;
    const needsCleanup = contacts.filter(c => compactName(c).toLowerCase().includes("unknown") || !c.primary_role || !c.email).length;
    const noContactLogged = contacts.filter(c => c.relationship_id && !c.last_contacted_at).length;
    return { total: contacts.length, withEmail, priority, active, needsCleanup, noContactLogged };
  }, [contacts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: Object.fromEntries(form.tag_keys.map(tag => [tag, true])),
          tag_keys: undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm(emptyForm);
        await fetchContacts();
      }
    } finally {
      setSaving(false);
    }
  };

  const startEditingContact = () => {
    if (!selectedContact) return;
    setEditError("");
    setEditForm({
      first_name: selectedContact.first_name || "",
      last_name: selectedContact.last_name || "",
      email: selectedContact.email || "",
      phone: selectedContact.phone || "",
      primary_role: selectedContact.primary_role || "",
      source: selectedContact.source || "",
      relationship_stage: selectedContact.relationship_stage || "",
      notes_summary: selectedContact.notes_summary || selectedContact.relationship_interests || "",
      tag_keys: tagKeysFor(selectedContact.tags),
    });
    setEditingContact(true);
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`${API_URL}/contacts/${selectedContact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          primary_role: editForm.primary_role || null,
          source: editForm.source.trim() || null,
          relationship_stage: editForm.relationship_stage || null,
          notes_summary: editForm.notes_summary.trim() || null,
          tags: Object.fromEntries(editForm.tag_keys.map(tag => [tag, true])),
          tag_keys: undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update contact");
      const updated = (await res.json()) as Contact;
      setSelectedContact(updated);
      setEditingContact(false);
      await fetchContacts();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update contact");
    } finally {
      setSaving(false);
    }
  };

  const handleLogQuickNote = async () => {
    if (!selectedContact || !quickNote.trim()) return;
    setLoggingNote(true);
    setTimelineError("");
    try {
      const res = await fetch(`${API_URL}/contacts/${selectedContact.id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          content: quickNote.trim(),
          summary: quickNote.trim(),
        }),
      });
      if (!res.ok) throw new Error("Could not save note");
      const item = (await res.json()) as TimelineItem;
      setTimeline(prev => [item, ...prev]);
      setQuickNote("");
      await fetchContacts();
    } catch (error) {
      setTimelineError(error instanceof Error ? error.message : "Could not save note");
    } finally {
      setLoggingNote(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setTaskBusyId(taskId);
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok && selectedContact) {
        await Promise.all([fetchContactTasks(selectedContact.id), fetchTimeline(selectedContact.id), fetchContacts()]);
      }
    } finally {
      setTaskBusyId("");
    }
  };

  const stageClass = (stage: string | null) => {
    const map: Record<string, string> = {
      partner: "border-green-500/30 bg-green-500/10 text-green-300",
      high_value: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      active: "border-blue-500/30 bg-blue-500/10 text-blue-200",
      dormant: "border-red-500/30 bg-red-500/10 text-red-200",
      new: "border-soft bg-soft/30 text-muted",
    };
    return map[stage || ""] || "border-soft bg-soft/30 text-muted";
  };

  const selectedParam = encodeURIComponent(Array.from(selectedRelationshipIds).join(","));
  const selectedRelationshipCount = selectedRelationshipIds.size;
  const selectedEmailContacts = useMemo(
    () => contacts.filter(contact => contact.relationship_id && selectedRelationshipIds.has(contact.relationship_id) && contact.email),
    [contacts, selectedRelationshipIds]
  );
  const visibleRelationshipContacts = useMemo(
    () => contacts.filter(contact => contact.relationship_id),
    [contacts]
  );
  const visibleSelectedRelationshipCount = useMemo(
    () => visibleRelationshipContacts.filter(contact => selectedRelationshipIds.has(contact.relationship_id!)).length,
    [selectedRelationshipIds, visibleRelationshipContacts]
  );

  const toggleRelationshipSelected = (contact: Contact) => {
    if (!contact.relationship_id) return;
    setSelectedRelationshipIds(prev => {
      const next = new Set(prev);
      if (next.has(contact.relationship_id!)) next.delete(contact.relationship_id!);
      else next.add(contact.relationship_id!);
      return next;
    });
  };

  const toggleVisibleRelationshipContacts = () => {
    setSelectedRelationshipIds(prev => {
      const next = new Set(prev);
      const allVisibleSelected =
        visibleRelationshipContacts.length > 0 &&
        visibleRelationshipContacts.every(contact => contact.relationship_id && next.has(contact.relationship_id));

      visibleRelationshipContacts.forEach(contact => {
        if (!contact.relationship_id) return;
        if (allVisibleSelected) next.delete(contact.relationship_id);
        else next.add(contact.relationship_id);
      });
      return next;
    });
  };

  const toggleFormTag = (tag: string) => {
    setForm(prev => ({
      ...prev,
      tag_keys: prev.tag_keys.includes(tag)
        ? prev.tag_keys.filter(current => current !== tag)
        : [...prev.tag_keys, tag],
    }));
  };

  const toggleEditTag = (tag: string) => {
    setEditForm(prev => ({
      ...prev,
      tag_keys: prev.tag_keys.includes(tag)
        ? prev.tag_keys.filter(current => current !== tag)
        : [...prev.tag_keys, tag],
    }));
  };

  const contentEmailMailto = useMemo(() => {
    const emails = selectedEmailContacts.map(contact => contact.email).filter(Boolean).join(",");
    if (!emails) return "";

    const attachments = [
      ["Photos", contentEmailForm.photoUrls],
      ["Videos", contentEmailForm.videoUrls],
      ["URLs", contentEmailForm.contentUrls],
      ["Past recording links", contentEmailForm.recordingLinks],
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}:\n${value.trim()}`)
      .join("\n\n");

    const body = [contentEmailForm.message.trim(), attachments].filter(Boolean).join("\n\n");
    return `mailto:?bcc=${encodeURIComponent(emails)}&subject=${encodeURIComponent(contentEmailForm.subject.trim())}&body=${encodeURIComponent(body)}`;
  }, [contentEmailForm, selectedEmailContacts]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Network CRM</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Contacts</h2>
          <p className="text-sm text-muted mt-1">Clean, segment, prioritize, and work the people in the network.</p>
          {intent ? <p className="mt-2 text-xs text-accent">Context: {intent === "invite" ? "Invite flow" : "Target review flow"}</p> : null}
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 transition">
          Add Contact
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Total", stats.total],
          ["With email", stats.withEmail],
          ["High priority", stats.priority],
          ["Active", stats.active],
          ["No contact logged", stats.noContactLogged],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto_auto]">
          <input
            type="text"
            placeholder="Search name, email, phone, or role"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setShowContentModal(true)}
            disabled={selectedRelationshipCount === 0}
            className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send Content
          </button>
          <Link href={selectedRelationshipCount > 0 ? `/events?relationship_ids=${selectedParam}` : "/events"} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Invite</Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <label className="inline-flex items-center gap-2 rounded-md border border-soft px-2.5 py-1.5">
            <input
              type="checkbox"
              checked={visibleRelationshipContacts.length > 0 && visibleSelectedRelationshipCount === visibleRelationshipContacts.length}
              onChange={toggleVisibleRelationshipContacts}
              className="h-3.5 w-3.5 rounded border-soft bg-base text-accent"
            />
            Select visible
          </label>
          <span>Selected relationship contacts: {selectedRelationshipCount}</span>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Contact</h3>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
            {CONTACT_TEXT_FIELDS.map(([field, label, required]) => (
              <input key={field} required={required} placeholder={label}
                value={form[field]}
                onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            ))}
            <select value={form.primary_role} onChange={e => setForm(p => ({ ...p, primary_role: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              <option value="">Select role</option>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={form.relationship_stage} onChange={e => setForm(p => ({ ...p, relationship_stage: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              <option value="">Select stage</option>
              {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
            <textarea placeholder="Notes" value={form.notes_summary}
              onChange={e => setForm(p => ({ ...p, notes_summary: e.target.value }))}
              className="md:col-span-2 h-24 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <div className="md:col-span-2 rounded-lg border border-soft bg-base p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map(tag => {
                  const selected = form.tag_keys.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleFormTag(tag.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                        selected ? "border-accent/60 bg-accent/15 text-text" : "border-soft text-muted hover:bg-soft/40 hover:text-text"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
                {saving ? "Saving..." : "Save Contact"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showContentModal ? (
        <div className="fixed inset-0 z-50 bg-canvas/70 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-content-title"
            className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-y-auto rounded-lg border border-soft bg-panel p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Selected contacts</p>
                <h3 id="send-content-title" className="mt-1 text-lg font-semibold text-text">Send Content Email</h3>
                <p className="mt-1 text-sm text-muted">
                  {selectedEmailContacts.length} with email / {selectedRelationshipCount} selected
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowContentModal(false)}
                className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft/40"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                value={contentEmailForm.subject}
                onChange={event => setContentEmailForm(prev => ({ ...prev, subject: event.target.value }))}
                placeholder="Email subject"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={contentEmailForm.message}
                onChange={event => setContentEmailForm(prev => ({ ...prev, message: event.target.value }))}
                placeholder="Message"
                className="h-28 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={contentEmailForm.photoUrls}
                onChange={event => setContentEmailForm(prev => ({ ...prev, photoUrls: event.target.value }))}
                placeholder="Photo links, one per line"
                className="h-20 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={contentEmailForm.videoUrls}
                onChange={event => setContentEmailForm(prev => ({ ...prev, videoUrls: event.target.value }))}
                placeholder="Video links, one per line"
                className="h-20 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={contentEmailForm.contentUrls}
                onChange={event => setContentEmailForm(prev => ({ ...prev, contentUrls: event.target.value }))}
                placeholder="URLs to include, one per line"
                className="h-20 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={contentEmailForm.recordingLinks}
                onChange={event => setContentEmailForm(prev => ({ ...prev, recordingLinks: event.target.value }))}
                placeholder="Past recording links, one per line"
                className="h-20 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            </div>

            <div className="mt-4 rounded-md border border-soft bg-base p-3 text-xs text-muted">
              Email will open in your mail app with selected contacts in BCC. Files should be shared as links so photos, videos, and recordings stay accessible.
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setContentEmailForm(emptyContentEmailForm)}
                className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40"
              >
                Reset
              </button>
              <a
                href={contentEmailMailto || undefined}
                aria-disabled={!contentEmailMailto}
                onClick={() => {
                  if (contentEmailMailto) setShowContentModal(false);
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  contentEmailMailto ? "bg-accent text-text hover:brightness-110" : "pointer-events-none border border-soft text-muted"
                }`}
              >
                Send Email
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-soft bg-panel overflow-hidden">
          <div className="grid grid-cols-[36px_minmax(220px,1.4fr)_170px_130px_120px_minmax(220px,1fr)_120px] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
            <span>Select</span>
            <span>Name</span>
            <span>Role</span>
            <span>Stage</span>
            <span>Priority</span>
            <span>Contact</span>
            <span>Source</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading contacts...</p>
          ) : contacts.length === 0 ? (
            <div className="p-5">
              <p className="text-sm font-semibold text-text">No contacts are in this view yet.</p>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Import a CSV, connect Google Contacts, or add the first relationship manually. Contacts stay scoped to this workspace, so one client account will not see another client&apos;s people.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/imports" className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text hover:brightness-110">Import Contacts</Link>
                <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Connect Google Contacts</Link>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40"
                >
                  Add Contact
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-[680px] overflow-auto divide-y divide-soft">
              {contacts.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => {
                    setSelectedContact(contact);
                    setEditingContact(false);
                    setEditError("");
                  }}
                  className={`grid w-full grid-cols-[36px_minmax(220px,1.4fr)_170px_130px_120px_minmax(220px,1fr)_120px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedContact?.id === contact.id ? "bg-accent/10" : ""}`}
                >
                  <span>
                    <input
                      type="checkbox"
                      disabled={!contact.relationship_id}
                      checked={Boolean(contact.relationship_id && selectedRelationshipIds.has(contact.relationship_id))}
                      onClick={event => event.stopPropagation()}
                      onChange={() => toggleRelationshipSelected(contact)}
                      className="h-3.5 w-3.5 rounded border-soft bg-base text-accent disabled:opacity-30"
                      aria-label={`Select ${compactName(contact)} for content`}
                    />
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-soft bg-base text-xs font-semibold text-accent">{initialsFor(contact)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">{compactName(contact)}</span>
                      <span className="block truncate text-xs text-muted">{contact.relationship_interests || contact.phone || "No context"}</span>
                    </span>
                  </span>
                  <span className="truncate text-muted">{formatRole(contact.primary_role)}</span>
                  <span><span className={`rounded-full border px-2 py-1 text-xs capitalize ${stageClass(contact.relationship_stage)}`}>{contact.relationship_stage || "unset"}</span></span>
                  <span className="text-muted">{contact.priority_score != null ? contact.priority_score.toFixed(1) : "-"}</span>
                  <span className="truncate text-muted">{contact.email || "No email"}</span>
                  <span className="truncate text-muted capitalize">{contact.source || "-"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-soft bg-panel p-5">
          {selectedContact ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">Selected contact</p>
                    <h3 className="mt-1 text-xl font-semibold text-text">{compactName(selectedContact)}</h3>
                    <p className="mt-1 text-sm text-muted">{formatRole(selectedContact.primary_role)}</p>
                  </div>
                  {!editingContact ? (
                    <button
                      type="button"
                      onClick={startEditingContact}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-text hover:brightness-110"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </div>
              {editingContact ? (
                <form onSubmit={handleUpdateContact} className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CONTACT_TEXT_FIELDS.map(([field, label, required]) => (
                      <input
                        key={field}
                        required={required}
                        placeholder={label}
                        value={editForm[field]}
                        onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                        className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                      />
                    ))}
                  </div>
                  <select
                    value={editForm.primary_role}
                    onChange={e => setEditForm(prev => ({ ...prev, primary_role: e.target.value }))}
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60"
                  >
                    <option value="">Select role</option>
                    {ROLE_OPTIONS.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <select
                    value={editForm.relationship_stage}
                    onChange={e => setEditForm(prev => ({ ...prev, relationship_stage: e.target.value }))}
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60"
                  >
                    <option value="">Select stage</option>
                    {STAGES.map(stage => <option key={stage} value={stage}>{stage.replace(/_/g, " ")}</option>)}
                  </select>
                  <input
                    value={editForm.source}
                    onChange={e => setEditForm(prev => ({ ...prev, source: e.target.value }))}
                    placeholder="Source"
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                  />
                  <textarea
                    value={editForm.notes_summary}
                    onChange={e => setEditForm(prev => ({ ...prev, notes_summary: e.target.value }))}
                    placeholder="Notes"
                    className="h-28 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                  />
                  <div className="rounded-lg border border-soft bg-base p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {TAG_OPTIONS.map(tag => {
                        const selected = editForm.tag_keys.includes(tag.value);
                        return (
                          <button
                            key={tag.value}
                            type="button"
                            onClick={() => toggleEditTag(tag.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                              selected ? "border-accent/60 bg-accent/15 text-text" : "border-soft text-muted hover:bg-soft/40 hover:text-text"
                            }`}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {editError ? <p className="text-sm text-red-300">{editError}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContact(false);
                        setEditError("");
                      }}
                      className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
              {tagKeysFor(selectedContact.tags).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tagKeysFor(selectedContact.tags).map(tag => (
                    <span key={tag} className="rounded-full border border-soft bg-base px-2 py-1 text-xs capitalize text-muted">
                      {tagLabelFor(tag)}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-soft bg-base p-3">
                  <p className="text-xs text-muted">Strength</p>
                  <p className="text-lg font-semibold text-text">{(selectedContact.relationship_strength ?? selectedContact.relationship_strength_score).toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-soft bg-base p-3">
                  <p className="text-xs text-muted">Priority</p>
                  <p className="text-lg font-semibold text-text">{selectedContact.priority_score != null ? selectedContact.priority_score.toFixed(1) : "-"}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted">Email: <span className="text-text">{selectedContact.email || "Missing"}</span></p>
                <p className="text-muted">Phone: <span className="text-text">{selectedContact.phone || "Missing"}</span></p>
                <p className="text-muted">Stage: <span className="text-text capitalize">{selectedContact.relationship_stage || "Unset"}</span></p>
                <p className="text-muted">Segment: <span className="text-text">{(selectedContact.market_segment || "general").replace(/_/g, " ")}</span></p>
                <p className="text-muted">Last contacted: <span className="text-text">{selectedContact.last_contacted_at ? new Date(selectedContact.last_contacted_at).toLocaleDateString() : "Not logged"}</span></p>
              </div>
              {selectedContact.relationship_id ? (
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-2 rounded-md border border-soft px-3 py-2 text-xs text-muted">
                    <input type="checkbox" checked={selectedRelationshipIds.has(selectedContact.relationship_id)} onChange={() => toggleRelationshipSelected(selectedContact)} className="h-3.5 w-3.5 rounded border-soft bg-base text-accent" />
                    Select for content
                  </label>
                  <Link href={`/content?relationship_ids=${encodeURIComponent(selectedContact.relationship_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Send Content</Link>
                  <Link href={`/events?relationship_ids=${encodeURIComponent(selectedContact.relationship_id)}`} className="rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40">Invite</Link>
                </div>
              ) : null}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedContact.relationship_interests || selectedContact.notes_summary || "No notes captured yet."}</p>
              </div>
              <div className="rounded-lg border border-soft bg-base p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">Open tasks</p>
                    <p className="mt-1 text-xs text-muted">Follow-ups and next steps assigned to this contact.</p>
                  </div>
                  <span className="rounded-full border border-soft bg-panel px-2 py-1 text-[11px] text-muted">{contactTasks.length}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {contactTasks.length === 0 ? (
                    <p className="rounded-md border border-soft bg-panel p-3 text-sm text-muted">No open tasks for this contact.</p>
                  ) : null}
                  {contactTasks.map(task => (
                    <article key={task.id} className="rounded-md border border-soft bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{task.title}</p>
                          {task.description ? <p className="mt-1 text-xs text-muted">{task.description}</p> : null}
                          <p className="mt-1 text-[11px] text-muted">
                            {task.assigned_to_name || task.assigned_to_email || "Unassigned"} · {taskDueLabel(task.due_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCompleteTask(task.id)}
                          disabled={taskBusyId === task.id}
                          className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-text disabled:opacity-50"
                        >
                          {taskBusyId === task.id ? "Closing..." : "Done"}
                        </button>
                      </div>
                      {task.suggested_message ? <p className="mt-2 rounded-md border border-soft bg-base p-2 text-xs text-text">{task.suggested_message}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-soft bg-base p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">Relationship memory</p>
                    <p className="mt-1 text-xs text-muted">Notes, meetings, signals, and engagement history.</p>
                  </div>
                  <span className="rounded-full border border-soft bg-panel px-2 py-1 text-[11px] text-muted">{timeline.length}</span>
                </div>
                <div className="mt-3 grid gap-2">
                  <textarea
                    value={quickNote}
                    onChange={event => setQuickNote(event.target.value)}
                    placeholder="Log a quick note, call, text, or follow-up outcome"
                    className="h-20 resize-none rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleLogQuickNote}
                    disabled={loggingNote || !quickNote.trim()}
                    className="justify-self-start rounded-md bg-accent px-3 py-2 text-xs font-semibold text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loggingNote ? "Saving..." : "Log Note"}
                  </button>
                </div>
                {timelineError ? <p className="mt-2 text-xs text-red-300">{timelineError}</p> : null}
                <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {timelineLoading ? <p className="text-sm text-muted">Loading memory...</p> : null}
                  {!timelineLoading && timeline.length === 0 ? (
                    <p className="rounded-md border border-soft bg-panel p-3 text-sm text-muted">
                      No relationship activity logged yet. Add the first note to start building memory.
                    </p>
                  ) : null}
                  {timeline.map(item => (
                    <article key={`${item.source}-${item.id}`} className="rounded-md border border-soft bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{item.title}</p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{item.source.replace(/_/g, " ")}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted">{timelineDate(item.occurred_at)}</span>
                      </div>
                      {item.body ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{item.body}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Select a contact to review details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
