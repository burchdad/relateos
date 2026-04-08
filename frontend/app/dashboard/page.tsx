"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import DashboardList from "@/components/DashboardList";
import DemoGuide from "@/components/DemoGuide";
import { PriorityItem, ScoreExplanation } from "@/components/types";

type RelationshipFormState = {
  firstName: string;
  lastName: string;
  type: "lead" | "investor" | "agent" | "partner";
  interests: string;
  currentStatus: "cold" | "active" | "hot" | "past_deal";
  lastInteractionTiming: "today" | "this_week" | "stale";
  ownerUserId: string;
};

const resolveApiUrl = () => {
  let url: string;
  
  if (process.env.NEXT_PUBLIC_API_URL) {
    url = process.env.NEXT_PUBLIC_API_URL;
  } else if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    url = "http://localhost:8000/api/v1";
  } else {
    url = "/_/backend/api/v1";
  }
  
  // Auto-normalize hostname-only values such as "relateos-production.up.railway.app"
  if (url && !url.startsWith("http") && !url.startsWith("/")) {
    const normalized = `https://${url.replace(/^\/+/, "")}`;
    url = normalized.endsWith("/api/v1") ? normalized : `${normalized}/api/v1`;
    console.warn(`[API] Normalized API_URL to: ${url}`);
  }

  // Last-resort guard for malformed values
  if (url && !url.startsWith("http") && !url.startsWith("/")) {
    console.warn(`[API] Invalid API_URL format after normalization: ${url}. Using fallback.`);
    url = "/_/backend/api/v1";
  }
  
  console.info(`[API] Resolved API URL: ${url}`);
  return url;
};

export default function DashboardPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [explanations, setExplanations] = useState<Record<string, ScoreExplanation>>({});
  const [loadingExplanation, setLoadingExplanation] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<RelationshipFormState>({
    firstName: "",
    lastName: "",
    type: "lead",
    interests: "",
    currentStatus: "active",
    lastInteractionTiming: "stale",
    ownerUserId: "",
  });

  const fetchPriorities = useCallback(async () => {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchPriorities();
  }, [fetchPriorities]);

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

  const onCreateRelationship = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!form.firstName.trim() || !form.lastName.trim() || !form.interests.trim()) {
      setCreateError("First name, last name, role, interests, status, and last interaction are required.");
      return;
    }

    setCreating(true);
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
      await fetchPriorities();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create relationship");

      // If the write succeeded but the response failed (for example, transient proxy/CORS error),
      // immediately refresh priorities so the new relationship appears without manual reload.
      await fetchPriorities();
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
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Today&apos;s Focus</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Who should you talk to today, and what should you say? Priorities are scored by relationship momentum, risk, value, and recency.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setCreateError("");
            }}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110"
          >
            {showCreateForm ? "Close" : "Add Relationship + Context"}
          </button>
        </div>
        </header>

        {showCreateForm ? (
          <form onSubmit={onCreateRelationship} className="mb-6 rounded-2xl border border-soft bg-panel/60 p-4">
            <h2 className="text-base font-semibold text-text">Create Relationship With Context</h2>
            <p className="mt-1 text-xs text-muted">This 15-second input unlocks summary, score signals, and first message instantly.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <option value="lead">Lead</option>
                <option value="investor">Investor</option>
                <option value="agent">Agent</option>
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

            <div className="mt-4 flex items-center gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
        ) : null}

        {loading ? <p className="text-muted">Loading priorities...</p> : null}
        {error ? <p className="text-red-300">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="rounded-2xl border border-soft bg-panel/50 p-6 text-sm text-muted">
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
          <DashboardList
            items={items}
            onSimulateSend={onSimulateSend}
            explanations={explanations}
            loadingExplanation={loadingExplanation}
            onLoadExplanation={onLoadExplanation}
          />
        ) : null}
      </main>
      <DemoGuide />
    </>
  );
}
