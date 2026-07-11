"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS, normalizeRoleKey } from "@/components/roleTaxonomy";
import { Contact, EventItem } from "@/components/types";

type EventForm = {
  title: string;
  description: string;
  eventType: "weekly" | "monthly" | "one-time";
  eventUrl: string;
  dayOfWeek: string;
  timeOfDay: string;
  calendarStartDate: string;
  addToCalendar: boolean;
  ownerUserId: string;
};

const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const todayInputValue = () => new Date().toISOString().slice(0, 10);
const emptyForm: EventForm = {
  title: "",
  description: "",
  eventType: "weekly",
  eventUrl: "",
  dayOfWeek: "1",
  timeOfDay: "12:00 PM",
  calendarStartDate: todayInputValue(),
  addToCalendar: true,
  ownerUserId: "",
};

const pad = (value: number) => String(value).padStart(2, "0");

const parseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hours: 12, minutes: 0 };

  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return { hours: Math.min(23, Math.max(0, hours)), minutes: Math.min(59, Math.max(0, minutes)) };
};

const dateFromInput = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const nextDateForDay = (startDate: string, dayOfWeek: number) => {
  const date = dateFromInput(startDate);
  const offset = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + offset);
  return date;
};

const googleDate = (date: Date) => {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
};

const openCalendarEvent = (event: EventForm) => {
  const startDate =
    event.eventType === "one-time"
      ? dateFromInput(event.calendarStartDate)
      : nextDateForDay(event.calendarStartDate, Number(event.dayOfWeek));
  const { hours, minutes } = parseTime(event.timeOfDay);
  startDate.setHours(hours, minutes, 0, 0);
  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 1);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title.trim(),
    dates: `${googleDate(startDate)}/${googleDate(endDate)}`,
    details: [event.description.trim(), "", `Link: ${event.eventUrl.trim()}`].join("\n"),
    location: event.eventUrl.trim(),
  });

  if (event.eventType === "weekly") {
    params.set("recur", "RRULE:FREQ=WEEKLY");
  }
  if (event.eventType === "monthly") {
    params.set("recur", "RRULE:FREQ=MONTHLY");
  }

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
};

const openExistingCalendarEvent = (event: EventItem) => {
  openCalendarEvent({
    title: event.title,
    description: event.description,
    eventType: event.event_type,
    eventUrl: event.event_url,
    dayOfWeek: String(event.day_of_week ?? new Date().getDay()),
    timeOfDay: event.time_of_day,
    calendarStartDate: todayInputValue(),
    addToCalendar: true,
    ownerUserId: event.owner_user_id || "",
  });
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
const roleGroupFor = (contact: Contact) => {
  const role = normalizeRoleKey(contact.primary_role || contact.relationship_type);
  return ROLE_OPTIONS.find(option => option.value === role)?.group || "Other";
};

export default function EventsPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [calendarNotice, setCalendarNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteTags, setSelectedInviteTags] = useState<Set<string>>(new Set());
  const [selectedInviteRoleGroups, setSelectedInviteRoleGroups] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteSendMessage, setInviteSendMessage] = useState("");
  const [inviteSendError, setInviteSendError] = useState("");
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

  const availableInviteRoleGroups = useMemo(() => {
    const groups = new Set<string>();
    contacts.forEach(contact => groups.add(roleGroupFor(contact)));
    return Array.from(groups).sort();
  }, [contacts]);

  const inviteCandidates = useMemo(() => {
    const selectedTags = Array.from(selectedInviteTags);
    const selectedRoleGroups = Array.from(selectedInviteRoleGroups);
    return contacts.filter(contact => {
      const haystack = `${compactName(contact)} ${contact.email || ""} ${contact.phone || ""}`.toLowerCase();
      const matchesSearch = !inviteSearch.trim() || haystack.includes(inviteSearch.trim().toLowerCase());
      const contactTags = tagKeysFor(contact.tags);
      const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => contactTags.includes(tag));
      const matchesRoleGroups = selectedRoleGroups.length === 0 || selectedRoleGroups.includes(roleGroupFor(contact));
      return matchesSearch && matchesTags && matchesRoleGroups;
    });
  }, [contacts, inviteSearch, selectedInviteRoleGroups, selectedInviteTags]);

  const selectedInviteContacts = useMemo(
    () => contacts.filter(contact => selectedContactIds.has(contact.id)),
    [contacts, selectedContactIds]
  );
  const selectedInviteEmailContacts = useMemo(
    () => selectedInviteContacts.filter(contact => Boolean(contact.email)),
    [selectedInviteContacts]
  );
  const visibleSelectedCount = useMemo(
    () => inviteCandidates.filter(contact => selectedContactIds.has(contact.id)).length,
    [inviteCandidates, selectedContactIds]
  );

  const sendEventInvites = async () => {
    if (!selectedEvent || selectedInviteEmailContacts.length === 0) return;
    setSendingInvites(true);
    setInviteSendMessage("");
    setInviteSendError("");

    try {
      const res = await fetch(`${API_URL}/events/${selectedEvent.id}/send-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedInviteEmailContacts.map(contact => contact.id) }),
      });
      const payload = await res.json().catch(() => null) as { sent?: number; skipped?: string[]; detail?: string } | null;
      if (!res.ok) throw new Error(payload?.detail || "Could not send event invites.");
      const sent = payload?.sent || 0;
      setInviteSendMessage(`Sent ${sent} invite${sent === 1 ? "" : "s"} from the connected Google account.`);
      const skipped = selectedInviteContacts.length - selectedInviteEmailContacts.length + (payload?.skipped?.length || 0);
      if (skipped > 0) {
        setInviteSendError(`${skipped} selected contact${skipped === 1 ? "" : "s"} skipped because they do not have an email address.`);
      }
    } catch (e) {
      setInviteSendError(e instanceof Error ? e.message : "Could not send event invites.");
    } finally {
      setSendingInvites(false);
    }
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    setCalendarNotice("");

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
        calendar_start_date: form.calendarStartDate || null,
        add_to_calendar: form.addToCalendar,
        owner_user_id: form.ownerUserId.trim() || null,
      };

      const res = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create event");
      const created = (await res.json()) as EventItem;
      if (form.addToCalendar && created.calendar_sync_status === "failed") {
        setCalendarNotice(created.calendar_sync_error || "Event saved, but Google Calendar could not be updated.");
      }
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

  const toggleInviteRoleGroup = (group: string) => {
    setSelectedInviteRoleGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleContact = (contactId: string) => {
    setInviteSendMessage("");
    setInviteSendError("");
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const selectVisibleContacts = () => {
    setInviteSendMessage("");
    setInviteSendError("");
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      inviteCandidates.forEach(contact => next.add(contact.id));
      return next;
    });
  };

  const removeVisibleContacts = () => {
    setInviteSendMessage("");
    setInviteSendError("");
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      inviteCandidates.forEach(contact => next.delete(contact.id));
      return next;
    });
  };

  const restartInviteSelection = () => {
    setSelectedContactIds(new Set());
    setSelectedInviteTags(new Set());
    setSelectedInviteRoleGroups(new Set());
    setInviteSearch("");
    setInviteSendMessage("");
    setInviteSendError("");
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
          <button onClick={() => setShowInvitePanel(true)} className="rounded-lg border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40">
            Invite Contacts
          </button>
          <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110">
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

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="create-event-title">
          <button
            type="button"
            aria-label="Close create event"
            onClick={() => setShowForm(false)}
            className="absolute inset-0 bg-text/55"
          />
          <section className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-accent/30 bg-panel p-5 shadow-card sm:max-w-2xl sm:rounded-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-accent">Live session</p>
              <h2 id="create-event-title" className="mt-1 text-base font-semibold text-text">Create Event</h2>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-soft px-2 py-1 text-xs text-text hover:bg-soft/40">
              Close
            </button>
          </div>
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
            <label className="grid gap-1">
              <span className="text-xs text-muted">
                {form.eventType === "one-time" ? "Calendar date" : "Calendar start date"}
              </span>
              <input
                type="date"
                value={form.calendarStartDate}
                onChange={(e) => setForm((prev) => ({ ...prev, calendarStartDate: e.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60"
              />
            </label>
            <input
              value={form.ownerUserId}
              onChange={(e) => setForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}
              placeholder="Owner user ID"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <label className="md:col-span-2 flex items-center gap-2 rounded-md border border-soft bg-base px-3 py-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.addToCalendar}
                onChange={(e) => setForm((prev) => ({ ...prev, addToCalendar: e.target.checked }))}
                className="h-4 w-4 rounded border-soft bg-base text-accent focus:ring-accent"
              />
              Add this event to the client calendar after saving
            </label>
            {createError ? <p className="text-sm text-red-300 md:col-span-2">{createError}</p> : null}
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text">Cancel</button>
              <button type="submit" disabled={creating} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-60">
                {creating ? "Creating..." : "Save Event"}
              </button>
            </div>
          </form>
          </section>
        </div>
      ) : null}

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
      {calendarNotice ? (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-text">{calendarNotice}</p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-x-auto rounded-lg border border-soft bg-panel">
          <div className="grid min-w-[720px] grid-cols-[minmax(220px,1.4fr)_150px_170px_1fr] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
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
                  className={`grid w-full min-w-[720px] grid-cols-[minmax(220px,1.4fr)_150px_170px_1fr] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedEvent?.id === item.id ? "bg-accent/10" : ""}`}>
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
                <p className="text-muted">Attendees: <span className="text-text">{selectedEvent.attendees?.length || 0}</span></p>
                <p className="text-muted">
                  Calendar:{" "}
                  <span className="text-text">
                    {selectedEvent.calendar_sync_status === "synced"
                      ? "Synced"
                      : selectedEvent.calendar_sync_status === "failed"
                      ? "Needs attention"
                      : "Not synced"}
                  </span>
                </p>
              </div>
              {selectedEvent.calendar_sync_status === "failed" && selectedEvent.calendar_sync_error ? (
                <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-text">
                  {selectedEvent.calendar_sync_error}
                </p>
              ) : null}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Description</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedEvent.description}</p>
              </div>
              {selectedEvent.attendees?.length ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Calendar attendees</p>
                  <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-soft bg-base">
                    {selectedEvent.attendees.map(attendee => (
                      <div key={attendee.id} className="border-b border-soft px-3 py-2 text-sm last:border-b-0">
                        <p className="font-medium text-text">{attendee.name || attendee.email || "Unknown attendee"}</p>
                        <p className="text-xs text-muted">{attendee.email || "No email"} · {attendee.attendance_status.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-soft bg-base px-3 py-2 text-xs text-muted">
                  No calendar attendees synced yet. Run Sync Calendar Meetings from Connections after Google Calendar is connected.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <a href={selectedEvent.event_url} target="_blank" rel="noreferrer" className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text">Open Link</a>
                {selectedEvent.calendar_event_url ? (
                  <a href={selectedEvent.calendar_event_url} target="_blank" rel="noreferrer" className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Open Calendar</a>
                ) : (
                  <button onClick={() => openExistingCalendarEvent(selectedEvent)} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Add Manually</button>
                )}
                <button onClick={() => setShowInvitePanel(true)} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Invite Contacts</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Select an event to review details.</p>
          )}
        </aside>
      </div>

      {showInvitePanel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="invite-contacts-title">
          <button
            type="button"
            aria-label="Close invite contacts"
            onClick={() => setShowInvitePanel(false)}
            className="absolute inset-0 bg-text/55"
          />
          <section className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-soft bg-panel p-4 shadow-card sm:max-w-xl sm:rounded-lg sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Invite contacts</p>
                <h2 id="invite-contacts-title" className="mt-1 text-lg font-semibold text-text">
                  {selectedEvent ? selectedEvent.title : "Select an event"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Selected: {selectedInviteContacts.length} / With email: {selectedInviteEmailContacts.length} / Visible selected: {visibleSelectedCount}
                </p>
              </div>
              <button type="button" onClick={() => setShowInvitePanel(false)} className="rounded-md border border-soft px-2 py-1 text-xs text-text hover:bg-soft/40">
                Close
              </button>
            </div>
            {selectedEvent ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={selectVisibleContacts} className="rounded-md border border-soft px-2 py-2 text-xs text-text hover:bg-soft/40">
                    Select visible
                  </button>
                  <button onClick={removeVisibleContacts} className="rounded-md border border-soft px-2 py-2 text-xs text-text hover:bg-soft/40">
                    Remove visible
                  </button>
                  <button onClick={restartInviteSelection} className="rounded-md border border-soft px-2 py-2 text-xs text-muted hover:bg-soft/40 hover:text-text">
                    Restart
                  </button>
                </div>
                <input
                  value={inviteSearch}
                  onChange={e => setInviteSearch(e.target.value)}
                  placeholder="Search invitees"
                  className="w-full rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Role groups</p>
                  <div className="flex max-h-24 flex-wrap gap-2 overflow-auto">
                    {availableInviteRoleGroups.map(group => {
                      const selected = selectedInviteRoleGroups.has(group);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => toggleInviteRoleGroup(group)}
                          className={`rounded-full border px-2 py-1 text-xs transition ${
                            selected ? "border-accent/60 bg-accent/15 text-text" : "border-soft text-muted hover:bg-soft/40 hover:text-text"
                          }`}
                        >
                          {group}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Tags</p>
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
                  ) : (
                    <p className="rounded-md border border-soft px-3 py-2 text-xs text-muted">No contact tags available yet.</p>
                  )}
                </div>
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
                          <span className="mt-1 inline-flex rounded-full border border-soft px-2 py-0.5 text-[10px] text-muted">{roleGroupFor(contact)}</span>
                        </span>
                        <span className={`h-4 w-4 shrink-0 rounded border ${selected ? "border-accent bg-accent" : "border-soft bg-panel"}`} />
                      </button>
                    );
                  })}
                </div>
                {inviteSendMessage ? (
                  <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-text">
                    {inviteSendMessage}
                  </p>
                ) : null}
                {inviteSendError ? (
                  <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-text">
                    {inviteSendError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={sendEventInvites}
                  disabled={sendingInvites || selectedInviteEmailContacts.length === 0}
                  className={`block w-full rounded-md px-3 py-2 text-center text-sm font-semibold ${
                    selectedInviteEmailContacts.length > 0 && !sendingInvites
                      ? "bg-accent text-text hover:brightness-110"
                      : "border border-soft text-muted"
                  }`}
                >
                  {sendingInvites ? "Sending..." : "Email Invites"}
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-soft bg-base px-3 py-3 text-sm text-muted">
                Select an event first, then invite contacts.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
