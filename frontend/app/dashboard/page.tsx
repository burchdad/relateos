"use client";

import { useEffect, useState } from "react";

import DashboardList from "@/components/DashboardList";
import DemoGuide from "@/components/DemoGuide";
import { PriorityItem } from "@/components/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function DashboardPage() {
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPriorities = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/dashboard/priorities?limit=10`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load priorities");
      }
      const data = (await res.json()) as PriorityItem[];
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriorities();
  }, []);

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

  return (
    <>
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Today's Focus</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Who should you talk to today, and what should you say? Priorities are scored by relationship momentum, risk, value, and recency.
        </p>
        </header>

        {loading ? <p className="text-muted">Loading priorities...</p> : null}
        {error ? <p className="text-red-300">{error}</p> : null}
        {!loading && !error ? <DashboardList items={items} onSimulateSend={onSimulateSend} /> : null}
      </main>
      <DemoGuide />
    </>
  );
}
