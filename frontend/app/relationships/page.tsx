"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { resolveApiUrl } from "@/components/api";

type RelationshipRow = {
  id: string;
  type: string;
  lifecycle_stage: string;
  priority_score: number;
  person: {
    first_name: string;
    last_name: string;
    metadata: {
      interests?: string;
      current_status?: string;
    };
  };
};

export default function RelationshipsPage() {
  const API_URL = useMemo(resolveApiUrl, []);

  const [rows, setRows] = useState<RelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [intent, setIntent] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/relationships`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load relationships");
        }
        const data = (await res.json()) as RelationshipRow[];
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [API_URL]);

  const filtered = rows.filter((row) => {
    const name = `${row.person.first_name} ${row.person.last_name}`.toLowerCase();
    const matchesQuery = !query.trim() || name.includes(query.trim().toLowerCase());
    const matchesType = typeFilter === "all" || row.type === typeFilter;
    return matchesQuery && matchesType;
  });

  const uniqueTypes = Array.from(new Set(rows.map((row) => row.type))).sort();
  const selectedIdList = Array.from(selectedIds);
  const selectedParam = encodeURIComponent(selectedIdList.join(","));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    setIntent(url.searchParams.get("intent") || "");
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="mb-8 rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Relationships</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">Where your people live: search, segment, and review relationship readiness.</p>
        {intent ? (
          <p className="mt-2 text-xs text-accent">
            Context: {intent === "invite" ? "Invite flow" : "Target review flow"} active.
          </p>
        ) : null}
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-soft bg-panel/50 p-4 text-sm">
        <p className="text-muted">Selected: {selectedIds.size}</p>
        <Link
          href={selectedIds.size > 0 ? `/content?relationship_ids=${selectedParam}` : "/content"}
          className="rounded-md border border-soft px-3 py-1.5 text-text hover:bg-soft"
        >
          Send Content
        </Link>
        <Link
          href={selectedIds.size > 0 ? `/events?relationship_ids=${selectedParam}` : "/events"}
          className="rounded-md border border-soft px-3 py-1.5 text-text hover:bg-soft"
        >
          Invite to Event
        </Link>
        <Link
          href={selectedIds.size > 0 ? `/content?relationship_ids=${selectedParam}&intent=campaign` : "/content?intent=campaign"}
          className="rounded-md bg-accent px-3 py-1.5 text-canvas hover:brightness-110"
        >
          Start Campaign
        </Link>
      </section>

      <section className="mb-4 grid gap-3 rounded-2xl border border-soft bg-panel/50 p-4 sm:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
        >
          <option value="all">All types</option>
          {uniqueTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </section>

      {loading ? <p className="text-sm text-muted">Loading relationships...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <p className="rounded-xl border border-soft bg-panel/50 p-4 text-sm text-muted">No relationships match this filter.</p>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <section className="grid gap-3">
          {filtered.map((row) => {
            const interests = row.person.metadata?.interests || "No interests captured yet";
            const status = row.person.metadata?.current_status || row.lifecycle_stage;
            return (
              <article key={row.id} className="rounded-xl border border-soft bg-panel/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-text">
                      {row.person.first_name} {row.person.last_name}
                    </h2>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted">
                      {row.type} • {status}
                    </p>
                  </div>
                  <p className="rounded-full border border-soft bg-soft px-2.5 py-1 text-xs font-medium text-text">
                    Priority {row.priority_score.toFixed(1)}
                  </p>
                </div>
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) {
                          next.delete(row.id);
                        } else {
                          next.add(row.id);
                        }
                        return next;
                      });
                    }}
                    className="h-3.5 w-3.5 rounded border-soft bg-canvas text-accent"
                  />
                  Select for actions
                </label>
                <p className="mt-2 text-sm text-muted">Interests: {interests}</p>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
