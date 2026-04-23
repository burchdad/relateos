"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import AppTabs from "@/components/AppTabs";
import { resolveApiUrl } from "@/components/api";
import { EventItem } from "@/components/types";

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

export default function EventsPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [form, setForm] = useState<EventForm>({
    title: "",
    description: "",
    eventType: "weekly",
    eventUrl: "",
    dayOfWeek: "1",
    timeOfDay: "12:00 PM",
    ownerUserId: "",
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/events`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load events");
      }
      const data = (await res.json()) as EventItem[];
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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
      if (!res.ok) {
        throw new Error("Failed to create event");
      }

      setForm({
        title: "",
        description: "",
        eventType: "weekly",
        eventUrl: "",
        dayOfWeek: "1",
        timeOfDay: "12:00 PM",
        ownerUserId: "",
      });
      await loadEvents();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Events</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Create recurring or one-time Zoom/YouTube events that pair with your content and relationship workflows.
        </p>
        <div className="mt-4">
          <AppTabs />
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-soft bg-panel/60 p-4">
        <h2 className="text-base font-semibold text-text">Create Event</h2>
        <form onSubmit={onCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Event title"
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />
          <select
            value={form.eventType}
            onChange={(e) => setForm((prev) => ({ ...prev, eventType: e.target.value as EventForm["eventType"] }))}
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
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
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring sm:col-span-2"
          />

          <input
            value={form.eventUrl}
            onChange={(e) => setForm((prev) => ({ ...prev, eventUrl: e.target.value }))}
            placeholder="Zoom or YouTube link"
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring sm:col-span-2"
          />

          {form.eventType !== "one-time" ? (
            <select
              value={form.dayOfWeek}
              onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}
              className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
            >
              {dayLabels.map((label, idx) => (
                <option key={label} value={String(idx)}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-muted">No weekday needed for one-time event</div>
          )}

          <input
            value={form.timeOfDay}
            onChange={(e) => setForm((prev) => ({ ...prev, timeOfDay: e.target.value }))}
            placeholder="Time (e.g. 12:00 PM)"
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />

          <input
            value={form.ownerUserId}
            onChange={(e) => setForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}
            placeholder="Owner user ID (optional)"
            className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring sm:col-span-2"
          />

          {createError ? <p className="text-sm text-red-300 sm:col-span-2">{createError}</p> : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110 disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-soft bg-panel/50 p-4">
        <h2 className="text-base font-semibold text-text">Event List</h2>
        {loading ? <p className="mt-2 text-sm text-muted">Loading events...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}

        {!loading && !error && events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No events yet. Create your first recurring session above.</p>
        ) : null}

        {!loading && !error && events.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {events.map((item) => (
              <article key={item.id} className="rounded-md border border-soft bg-canvas/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-text">{item.title}</h3>
                  <span className="rounded-full border border-soft bg-soft px-2 py-0.5 text-xs uppercase tracking-wider text-muted">
                    {item.event_type}
                  </span>
                </div>
                <p className="mt-1 text-muted">{item.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {item.day_of_week === null ? "One-time" : dayLabels[item.day_of_week]} at {item.time_of_day}
                </p>
                <a href={item.event_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
                  Open event link
                </a>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
