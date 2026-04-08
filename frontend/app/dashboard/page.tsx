"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import DashboardList from "@/components/DashboardList";
import DemoGuide from "@/components/DemoGuide";
import { PriorityItem, ScoreExplanation } from "@/components/types";

const resolveApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8000/api/v1";
  }
  return "/_/backend/api/v1";
};

export default function DashboardPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [explanations, setExplanations] = useState<Record<string, ScoreExplanation>>({});
  const [loadingExplanation, setLoadingExplanation] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <>
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Today&apos;s Focus</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Who should you talk to today, and what should you say? Priorities are scored by relationship momentum, risk, value, and recency.
        </p>
        </header>

        {loading ? <p className="text-muted">Loading priorities...</p> : null}
        {error ? <p className="text-red-300">{error}</p> : null}
        {!loading && !error ? (
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
