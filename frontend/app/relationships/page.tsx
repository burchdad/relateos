"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { resolveApiUrl } from "@/components/api";
import { formatRole } from "@/components/roleTaxonomy";

type RelationshipRow = {
  id: string;
  type: string;
  lifecycle_stage: string;
  relationship_strength: number;
  priority_score: number;
  last_contacted_at: string | null;
  next_suggested_action_at: string | null;
  person: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    primary_role?: string | null;
    notes_summary?: string | null;
    metadata?: {
      interests?: string;
      current_status?: string;
    };
  };
};

const nameFor = (row: RelationshipRow) => `${row.person.first_name || ""} ${row.person.last_name || ""}`.trim() || "Unknown relationship";

const stageClass = (stage: string) => {
  const map: Record<string, string> = {
    active: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    partner: "border-green-500/30 bg-green-500/10 text-green-200",
    high_value: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
    dormant: "border-red-500/30 bg-red-500/10 text-red-200",
    new: "border-soft bg-soft/30 text-muted",
  };
  return map[stage] || "border-soft bg-soft/30 text-muted";
};

export default function RelationshipsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [rows, setRows] = useState<RelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [intent, setIntent] = useState("");
  const [selectedRow, setSelectedRow] = useState<RelationshipRow | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/relationships`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load relationships");
        const data = (await res.json()) as RelationshipRow[];
        setRows(data);
        setSelectedRow(data[0] || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [API_URL]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    setIntent(url.searchParams.get("intent") || "");
  }, []);

  const filtered = rows.filter((row) => {
    const haystack = `${nameFor(row)} ${row.type} ${row.lifecycle_stage} ${row.person.email || ""}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesType = typeFilter === "all" || row.type === typeFilter;
    const matchesStage = stageFilter === "all" || row.lifecycle_stage === stageFilter;
    return matchesQuery && matchesType && matchesStage;
  });

  const stats = useMemo(() => {
    const priority = rows.filter(row => row.priority_score >= 70).length;
    const active = rows.filter(row => ["active", "partner", "high_value"].includes(row.lifecycle_stage)).length;
    const stale = rows.filter(row => !row.last_contacted_at).length;
    const avgPriority = rows.length ? rows.reduce((sum, row) => sum + row.priority_score, 0) / rows.length : 0;
    return { total: rows.length, priority, active, stale, avgPriority };
  }, [rows]);

  const uniqueTypes = Array.from(new Set(rows.map((row) => row.type))).sort();
  const uniqueStages = Array.from(new Set(rows.map((row) => row.lifecycle_stage))).sort();
  const selectedParam = encodeURIComponent(Array.from(selectedIds).join(","));

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Relationship OS</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">Relationships</h1>
          <p className="text-sm text-muted mt-1">Prioritize who needs attention, then send content, invite, or start a campaign.</p>
          {intent ? <p className="mt-2 text-xs text-accent">Context: {intent === "invite" ? "Invite flow" : "Target review flow"}</p> : null}
        </div>
        <Link href="/dashboard" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 transition">
          Add Relationship
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Total", stats.total],
          ["High priority", stats.priority],
          ["Active", stats.active],
          ["No contact logged", stats.stale],
          ["Avg priority", stats.avgPriority.toFixed(1)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_auto_auto_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search relationships"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60">
            <option value="all">All types</option>
            {uniqueTypes.map((type) => <option key={type} value={type}>{formatRole(type)}</option>)}
          </select>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60">
            <option value="all">All stages</option>
            {uniqueStages.map((stage) => <option key={stage} value={stage}>{stage.replace(/_/g, " ")}</option>)}
          </select>
          <Link href={selectedIds.size > 0 ? `/content?relationship_ids=${selectedParam}` : "/content"} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Send Content</Link>
          <Link href={selectedIds.size > 0 ? `/events?relationship_ids=${selectedParam}` : "/events"} className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Invite</Link>
          <Link href={selectedIds.size > 0 ? `/content?relationship_ids=${selectedParam}&intent=campaign` : "/content?intent=campaign"} className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-canvas">Campaign</Link>
        </div>
        <p className="mt-3 text-xs text-muted">Selected: {selectedIds.size}</p>
      </section>

      {loading ? <p className="text-sm text-muted">Loading relationships...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="grid gap-3">
            {filtered.length === 0 ? (
              <p className="rounded-lg border border-soft bg-panel p-4 text-sm text-muted">No relationships match this view.</p>
            ) : filtered.map((row) => {
              const selected = selectedIds.has(row.id);
              const status = row.person.metadata?.current_status || row.lifecycle_stage;
              const interests = row.person.metadata?.interests || "No interests captured";
              return (
                <article key={row.id} className={`rounded-lg border bg-panel p-4 transition hover:border-accent/40 ${selectedRow?.id === row.id ? "border-accent/50" : "border-soft"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button onClick={() => setSelectedRow(row)} className="min-w-0 text-left">
                      <h2 className="truncate text-lg font-semibold text-text">{nameFor(row)}</h2>
                      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{formatRole(row.type)} / {status.replace(/_/g, " ")}</p>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs capitalize ${stageClass(row.lifecycle_stage)}`}>{row.lifecycle_stage.replace(/_/g, " ")}</span>
                      <span className="rounded-full border border-soft bg-base px-2 py-1 text-xs text-text">Priority {row.priority_score.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                    <p className="text-sm text-muted">{interests}</p>
                    <div className="rounded-md border border-soft bg-base p-3 text-xs text-muted">
                      Suggested next step: reconnect, update notes, or add to a campaign.
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={selected} onChange={() => toggleSelected(row.id)} className="h-3.5 w-3.5 rounded border-soft bg-base text-accent" />
                      Select
                    </label>
                    <button onClick={() => setSelectedRow(row)} className="rounded-md border border-soft px-3 py-1.5 text-xs text-text hover:bg-soft/40">Review</button>
                    <Link href={`/content?relationship_ids=${encodeURIComponent(row.id)}`} className="rounded-md border border-soft px-3 py-1.5 text-xs text-text hover:bg-soft/40">Send Content</Link>
                    <Link href={`/events?relationship_ids=${encodeURIComponent(row.id)}`} className="rounded-md border border-soft px-3 py-1.5 text-xs text-text hover:bg-soft/40">Invite</Link>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="rounded-lg border border-soft bg-panel p-5 xl:sticky xl:top-6 xl:self-start">
            {selectedRow ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Relationship detail</p>
                  <h3 className="mt-1 text-xl font-semibold text-text">{nameFor(selectedRow)}</h3>
                  <p className="mt-1 text-sm text-muted">{formatRole(selectedRow.type)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-soft bg-base p-3">
                    <p className="text-xs text-muted">Priority</p>
                    <p className="text-lg font-semibold text-text">{selectedRow.priority_score.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg border border-soft bg-base p-3">
                    <p className="text-xs text-muted">Strength</p>
                    <p className="text-lg font-semibold text-text">{selectedRow.relationship_strength.toFixed(1)}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-muted">Stage: <span className="text-text capitalize">{selectedRow.lifecycle_stage.replace(/_/g, " ")}</span></p>
                  <p className="text-muted">Email: <span className="text-text">{selectedRow.person.email || "Missing"}</span></p>
                  <p className="text-muted">Phone: <span className="text-text">{selectedRow.person.phone || "Missing"}</span></p>
                  <p className="text-muted">Last contacted: <span className="text-text">{selectedRow.last_contacted_at ? new Date(selectedRow.last_contacted_at).toLocaleDateString() : "Not logged"}</span></p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Context</p>
                  <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedRow.person.metadata?.interests || selectedRow.person.notes_summary || "No context captured yet."}</p>
                </div>
              </div>
            ) : <p className="text-sm text-muted">Select a relationship to review context.</p>}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
