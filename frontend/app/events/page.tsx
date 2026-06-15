"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import { Contact, EventItem } from "@/components/types";

type EventForm = {
  title: string;
  description: string;
  eventType: "weekly" | "monthly" | "one-time";
  eventUrl: string;
  dayOfWeek: string;
  timeOfDay: string;
  ownerUserId: string;
};

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyForm: EventForm = {
  title: "",
  description: "",
  eventType: "weekly",
  eventUrl: "",
  dayOfWeek: "1",
  timeOfDay: "12:00 PM",
  ownerUserId: "",
};

const typeClass = (type: string) => {
  const map: Record<string, string> = {
    weekly: "border-accent/40 bg-accent/10 text-accent",
    monthly: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    "one-time": "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  };
  return map[type] || "border-soft bg-soft/30 text-muted";
};

const compactName = (contact: Contact) => {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  return name || contact.email || "Unknown contact";
};

const tagKeysFor = (tags: Record<string, unknown> | null | undefined) => {
  if (!tags) return [];
  const labels = Array.isArray(tags.labels) ? tags.labels.map(String) : [];
  const keyedTags = Object.entries(tags)
    .filter(([key, value]) => key !== "labels" && Boolean(value))
    .map(([key]) => key);
  return Array.from(new Set([...labels, ...keyedTags]));
};

const tagLabelFor = (tag: string) => tag.replace(/_/g, " ");

export default function EventsPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteTags, setSelectedInviteTags] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [preselectedRelationshipIds, setPreselectedRelationshipIds] = useState<Set<string>>(new Set());
  const [queryEventId, setQueryEventId] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/events`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load events");
      const data = (await res.json()) as EventItem[];
      setEvents(data);
      setSelectedEvent((current) => current ? data.find(event => event.id === current.id) || current : data[0] || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await fetch(`${API_URL}/contacts?limit=500`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load contacts");
      setContacts((await res.json()) as Contact[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setContactsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const relationshipIds = url.searchParams.get("relationship_ids");
    const eventId = url.searchParams.get("event_id");
    if (relationshipIds) {
      setPreselectedRelationshipIds(new Set(relationshipIds.split(",").map(id => id.trim()).filter(Boolean)));
      setShowInvitePanel(true);
    }
    if (eventId) {
      setQueryEventId(eventId);
      setShowInvitePanel(true);
    }
  }, []);

  useEffect(() => {
    if (!queryEventId || events.length === 0) return;
    const event = events.find(item => item.id === queryEventId);
    if (event) setSelectedEvent(event);
  }, [events, queryEventId]);

  useEffect(() => {
    if (preselectedRelationshipIds.size === 0 || contacts.length === 0) return;
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      contacts.forEach(contact => {
        if (contact.relationship_id && preselectedRelationshipIds.has(contact.relationship_id)) {
          next.add(contact.id);
        }
      });
      return next;
    });
  }, [contacts, preselectedRelationshipIds]);

  const filteredEvents = events.filter(event => {
    const haystack = `${event.title} ${event.description} ${event.event_type} ${event.time_of_day}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesType = typeFilter === "all" || event.event_type === typeFilter;
    return matchesQuery && matchesType;
  });

  const stats = useMemo(() => {
    const weekly = events.filter(event => event.event_type === "weekly").length;
    const monthly = events.filter(event => event.event_type === "monthly").length;
    const oneTime = events.filter(event => event.event_type === "one-time").length;
    const withOwner = events.filter(event => event.owner_user_id).length;
    return { total: events.length, weekly, monthly, oneTime, withOwner };
  }, [events]);

  const availableInviteTags = useMemo(() => {
    const tags = new Set<string>();
    contacts.forEach(contact => tagKeysFor(contact.tags).forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [contacts]);

  const inviteCandidates = useMemo(() => {
    const selectedTags = Array.from(selectedInviteTags);
    return contacts.filter(contact => {
      const haystack = `${compactName(contact)} ${contact.email || ""} ${contact.phone || ""}`.toLowerCase();
      const matchesSearch = !inviteSearch.trim() || haystack.includes(inviteSearch.trim().toLowerCase());
      const contactTags = tagKeysFor(contact.tags);
      const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => contactTags.includes(tag));
      return matchesSearch && matchesTags;
    });
  }, [contacts, inviteSearch, selectedInviteTags]);

  const selectedInviteContacts = useMemo(
    () => contacts.filter(contact => selectedContactIds.has(contact.id)),
    [contacts, selectedContactIds]
  );

  const inviteMailto = useMemo(() => {
    if (!selectedEvent || selectedInviteContacts.length === 0) return "";
    const emails = selectedInviteContacts.map(contact => contact.email).filter(Boolean).join(",");
    if (!emails) return "";
    const subject = `Invite: ${selectedEvent.title}`;
    const schedule = `${selectedEvent.day_of_week === null ? "One-time" : dayLabels[selectedEvent.day_of_week]} at ${selectedEvent.time_of_day}`;
    const body = [
      `You're invited to ${selectedEvent.title}.`,
      "",
      selectedEvent.description,
      "",
      `When: ${schedule}`,
      `Link: ${selectedEvent.event_url}`,
    ].join("\n");
    return `mailto:?bcc=${encodeURIComponent(emails)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [selectedEvent, selectedInviteContacts]);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!form.title.trim() || !form.description.trim() || !form.eventUrl.trim() || !form.timeOfDay.trim()) {
      setCreateError("Title, description, event URL, and time are required.");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        event_type: form.eventType,
        event_url: form.eventUrl.trim(),
        day_of_week: form.eventType === "one-time" ? null : Number(form.dayOfWeek),
        time_of_day: form.timeOfDay.trim(),
        owner_user_id: form.ownerUserId.trim() || null,
      };

      const res = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create event");

      setForm(emptyForm);
      setShowForm(false);
      await loadEvents();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  const toggleInviteTag = (tag: string) => {
    setSelectedInviteTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const toggleContact = (contactId: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const selectVisibleContacts = () => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      inviteCandidates.forEach(contact => next.add(contact.id));
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Live sessions</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">Events</h1>
          <p className="text-sm text-muted mt-1">Manage recurring webinars, investor calls, coaching sessions, and follow-up events.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowInvitePanel(v => !v)} className="rounded-lg border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40">
            Invite Contacts
          </button>
          <button onClick={() => setShowForm(v => !v)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110">
            Create Event
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Total", stats.total],
          ["Weekly", stats.weekly],
          ["Monthly", stats.monthly],
          ["One-time", stats.oneTime],
          ["Assigned", stats.withOwner],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <section className="rounded-lg border border-accent/30 bg-panel p-5">
          <h2 className="text-base font-semibold text-text">Create Event</h2>
          <form onSubmit={onCreate} className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Event title"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <select
              value={form.eventType}
              onChange={(e) => setForm((prev) => ({ ...prev, eventType: e.target.value as EventForm["eventType"] }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="one-time">One-time</option>
            </select>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Event description"
              rows={3}
              className="md:col-span-2 rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <input
              value={form.eventUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, eventUrl: e.target.value }))}
              placeholder="Zoom, Meet, YouTube, or event link"
              className="md:col-span-2 rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            {form.eventType !== "one-time" ? (
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60"
              >
                {dayLabels.map((label, idx) => <option key={label} value={String(idx)}>{label}</option>)}
              </select>
            ) : (
              <div className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-muted">One-time event</div>
            )}
            <input
              value={form.timeOfDay}
              onChange={(e) => setForm((prev) => ({ ...prev, timeOfDay: e.target.value }))}
              placeholder="Time, e.g. 12:00 PM"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <input
              value={form.ownerUserId}
              onChange={(e) => setForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}
              placeholder="Owner user ID"
              className="md:col-span-2 rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            {createError ? <p className="text-sm text-red-300 md:col-span-2">{createError}</p> : null}
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text">Cancel</button>
              <button type="submit" disabled={creating} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-60">
                {creating ? "Creating..." : "Save Event"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title, description, or time"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="all">All event types</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="one-time">One-time</option>
          </select>
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-soft bg-panel overflow-hidden">
          <div className="grid grid-cols-[minmax(220px,1.4fr)_150px_170px_1fr] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
            <span>Event</span>
            <span>Type</span>
            <span>Schedule</span>
            <span>Link</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading events...</p>
          ) : filteredEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted">No events match this view.</p>
          ) : (
            <div className="max-h-[680px] overflow-auto divide-y divide-soft">
              {filteredEvents.map(item => (
                <button key={item.id} onClick={() => setSelectedEvent(item)}
                  className={`grid w-full grid-cols-[minmax(220px,1.4fr)_150px_170px_1fr] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedEvent?.id === item.id ? "bg-accent/10" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-text">{item.title}</span>
                    <span className="block truncate text-xs text-muted">{item.description}</span>
                  </span>
                  <span><span className={`rounded-full border px-2 py-1 text-xs capitalize ${typeClass(item.event_type)}`}>{item.event_type}</span></span>
                  <span className="text-muted">{item.day_of_week === null ? "One-time" : dayLabels[item.day_of_week]} at {item.time_of_day}</span>
                  <span className="truncate text-accent">{item.event_url}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-soft bg-panel p-5 xl:sticky xl:top-6 xl:self-start">
          {selectedEvent ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Selected event</p>
                <h3 className="mt-1 text-xl font-semibold text-text">{selectedEvent.title}</h3>
                <p className="mt-2"><span className={`rounded-full border px-2 py-1 text-xs capitalize ${typeClass(selectedEvent.event_type)}`}>{selectedEvent.event_type}</span></p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted">Schedule: <span className="text-text">{selectedEvent.day_of_week === null ? "One-time" : dayLabels[selectedEvent.day_of_week]} at {selectedEvent.time_of_day}</span></p>
                <p className="text-muted">Owner: <span className="text-text">{selectedEvent.owner_user_id || "Unassigned"}</span></p>
                <p className="text-muted">Created: <span className="text-text">{new Date(selectedEvent.created_at).toLocaleDateString()}</span></p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Description</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedEvent.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={selectedEvent.event_url} target="_blank" rel="noreferrer" className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-canvas">Open Link</a>
                <button onClick={() => setShowInvitePanel(v => !v)} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Invite Contacts</button>
              </div>
              {showInvitePanel ? (
                <section className="space-y-3 rounded-lg border border-soft bg-base p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Invite contacts</p>
                      <p className="mt-1 text-xs text-muted">Selected: {selectedInviteContacts.length}</p>
                    </div>
                    <button onClick={selectVisibleContacts} className="rounded-md border border-soft px-2 py-1.5 text-xs text-text hover:bg-soft/40">
                      Select visible
                    </button>
                  </div>
                  <input
                    value={inviteSearch}
                    onChange={e => setInviteSearch(e.target.value)}
                    placeholder="Search invitees"
                    className="w-full rounded-md border border-soft bg-panel px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                  />
                  {availableInviteTags.length > 0 ? (
                    <div className="flex max-h-24 flex-wrap gap-2 overflow-auto">
                      {availableInviteTags.map(tag => {
                        const selected = selectedInviteTags.has(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleInviteTag(tag)}
                            className={`rounded-full border px-2 py-1 text-xs capitalize transition ${
                              selected ? "border-accent/60 bg-accent/15 text-text" : "border-soft text-muted hover:bg-soft/40 hover:text-text"
                            }`}
                          >
                            {tagLabelFor(tag)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="max-h-72 overflow-auto rounded-md border border-soft">
                    {contactsLoading ? (
                      <p className="p-3 text-sm text-muted">Loading contacts...</p>
                    ) : inviteCandidates.length === 0 ? (
                      <p className="p-3 text-sm text-muted">No contacts match this invite filter.</p>
                    ) : inviteCandidates.map(contact => {
                      const selected = selectedContactIds.has(contact.id);
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => toggleContact(contact.id)}
                          className={`flex w-full items-center justify-between gap-3 border-b border-soft px-3 py-2 text-left last:border-b-0 hover:bg-soft/20 ${selected ? "bg-accent/10" : ""}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-text">{compactName(contact)}</span>
                            <span className="block truncate text-xs text-muted">{contact.email || "No email"}</span>
                          </span>
                          <span className={`h-4 w-4 shrink-0 rounded border ${selected ? "border-accent bg-accent" : "border-soft bg-panel"}`} />
                        </button>
                      );
                    })}
                  </div>
                  <a
                    href={inviteMailto || undefined}
                    aria-disabled={!inviteMailto}
                    className={`block rounded-md px-3 py-2 text-center text-sm font-semibold ${
                      inviteMailto ? "bg-accent text-canvas hover:brightness-110" : "pointer-events-none border border-soft text-muted"
                    }`}
                  >
                    Email Invites
                  </a>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">Select an event to review details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
