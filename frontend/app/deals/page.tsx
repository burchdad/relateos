"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Deal, NaturalLanguageDealResult } from "@/components/types";

const STATUSES = ["idea", "lead", "contacted", "qualified", "active", "under_contract", "closed_won", "closed_lost", "dormant"];
const DEAL_TYPES = ["buyer_lead", "seller_lead", "referral", "coaching", "investment", "property", "vendor", "sponsorship", "podcast_funnel", "community_membership", "other"];

const labelFor = (value: string | null | undefined) => (value || "unknown").replace(/_/g, " ");

const statusClass = (status: string) => {
  const map: Record<string, string> = {
    closed_won: "border-green-500/30 bg-green-500/10 text-green-300",
    closed_lost: "border-red-500/30 bg-red-500/10 text-red-300",
    active: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    under_contract: "border-purple-500/30 bg-purple-500/10 text-purple-200",
    qualified: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    lead: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
    dormant: "border-soft bg-soft/30 text-muted",
  };
  return map[status] || "border-soft bg-soft/30 text-muted";
};

const money = (value: number | null | undefined) => value && value > 0 ? `$${value.toLocaleString()}` : "-";

export default function DealsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [nlInput, setNlInput] = useState("");
  const [nlResult, setNlResult] = useState<NaturalLanguageDealResult | null>(null);
  const [nlParsing, setNlParsing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("deal_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_URL}/deals?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDeals(data);
        setSelectedDeal((current) => current ? data.find((deal: Deal) => deal.id === current.id) || current : data[0] || null);
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL, statusFilter, typeFilter]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const filteredDeals = deals.filter(deal => {
    const haystack = `${deal.title} ${deal.description || ""} ${deal.deal_type} ${deal.status}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });

  const stats = useMemo(() => {
    const closedWon = deals.filter(d => d.status === "closed_won");
    const inFlight = deals.filter(d => !["closed_won", "closed_lost", "dormant"].includes(d.status));
    const expectedPipeline = inFlight.reduce((sum, deal) => sum + (deal.expected_value || deal.amount || 0), 0);
    const actualRevenue = closedWon.reduce((sum, deal) => sum + (deal.actual_value || deal.amount || 0), 0);
    const referralFees = deals.flatMap(d => d.participants).reduce((sum, p) => sum + (p.referral_fee || 0), 0);
    return { total: deals.length, inFlight: inFlight.length, expectedPipeline, actualRevenue, referralFees };
  }, [deals]);

  const handleNlParse = async () => {
    if (!nlInput.trim()) return;
    setNlParsing(true);
    setNlResult(null);
    try {
      const res = await fetch(`${API_URL}/deals/natural-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlInput }),
      });
      if (res.ok) setNlResult(await res.json());
    } finally {
      setNlParsing(false);
    }
  };

  const handleConfirmDeal = async () => {
    if (!nlResult) return;
    const res = await fetch(`${API_URL}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nlResult.parsed),
    });
    if (res.ok) {
      setNlInput("");
      setNlResult(null);
      await fetchDeals();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Revenue pipeline</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Deals</h2>
          <p className="text-sm text-muted mt-1">Track deal flow, referrals, splits, pipeline value, and closed revenue.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Pipeline", money(stats.expectedPipeline)],
          ["Closed revenue", money(stats.actualRevenue)],
          ["In flight", stats.inFlight],
          ["Total deals", stats.total],
          ["Referral fees", money(stats.referralFees)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-accent/30 bg-panel p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text">Quick Log</p>
            <p className="mt-1 text-xs text-muted">Describe the deal once. RelateOS will parse the basics before you save.</p>
          </div>
          {nlResult ? (
            <span className={`rounded-full border px-2 py-1 text-xs ${nlResult.confidence >= 0.8 ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"}`}>
              {Math.round(nlResult.confidence * 100)}% confidence
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={nlInput}
            onChange={e => setNlInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleNlParse()}
            placeholder='Example: Closed 15K coaching deal with Darian, split 50/50, March 12'
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <button onClick={handleNlParse} disabled={nlParsing || !nlInput.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 transition disabled:opacity-50">
            {nlParsing ? "Parsing..." : "Parse Deal"}
          </button>
        </div>

        {nlResult && (
          <div className="rounded-lg border border-soft bg-base p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Title", nlResult.parsed.title],
                ["Type", labelFor(String(nlResult.parsed.deal_type || ""))],
                ["Status", labelFor(String(nlResult.parsed.status || ""))],
                ["Amount", nlResult.parsed.amount ? money(Number(nlResult.parsed.amount)) : "-"],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md border border-soft bg-panel p-3">
                  <p className="text-xs uppercase tracking-wide text-muted">{label as string}</p>
                  <p className="mt-1 truncate text-sm font-medium capitalize text-text">{String(value || "-")}</p>
                </div>
              ))}
            </div>
            {nlResult.missing_fields.length > 0 ? (
              <p className="text-xs text-yellow-200">Missing: {nlResult.missing_fields.join(", ")}</p>
            ) : null}
            <div className="flex gap-3">
              <button onClick={handleConfirmDeal} className="rounded-md bg-green-500/15 border border-green-500/30 px-4 py-2 text-sm font-semibold text-green-300 hover:bg-green-500/20 transition">
                Confirm & Save
              </button>
              <button onClick={() => setNlResult(null)} className="px-4 py-2 text-sm text-muted hover:text-text transition">
                Discard
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search deal title, description, type, or status"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All types</option>
            {DEAL_TYPES.map(type => <option key={type} value={type}>{labelFor(type)}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All statuses</option>
            {STATUSES.map(status => <option key={status} value={status}>{labelFor(status)}</option>)}
          </select>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-soft bg-panel overflow-hidden">
          <div className="grid grid-cols-[minmax(220px,1.5fr)_170px_150px_130px_120px_130px] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
            <span>Deal</span>
            <span>Type</span>
            <span>Status</span>
            <span>Amount</span>
            <span>People</span>
            <span>Close</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading deals...</p>
          ) : filteredDeals.length === 0 ? (
            <p className="p-4 text-sm text-muted">No deals match this view.</p>
          ) : (
            <div className="max-h-[680px] overflow-auto divide-y divide-soft">
              {filteredDeals.map(deal => (
                <button
                  key={deal.id}
                  onClick={() => setSelectedDeal(deal)}
                  className={`grid w-full grid-cols-[minmax(220px,1.5fr)_170px_150px_130px_120px_130px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedDeal?.id === deal.id ? "bg-accent/10" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-text">{deal.title}</span>
                    <span className="block truncate text-xs text-muted">{deal.description || "No description"}</span>
                  </span>
                  <span className="truncate capitalize text-muted">{labelFor(deal.deal_type)}</span>
                  <span><span className={`rounded-full border px-2 py-1 text-xs capitalize ${statusClass(deal.status)}`}>{labelFor(deal.status)}</span></span>
                  <span className="text-text">{money(deal.amount || deal.expected_value)}</span>
                  <span className="text-muted">{deal.participants.length}</span>
                  <span className="text-muted">{deal.close_date ? new Date(deal.close_date).toLocaleDateString() : "-"}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-soft bg-panel p-5 xl:sticky xl:top-6 xl:self-start">
          {selectedDeal ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Selected deal</p>
                <h3 className="mt-1 text-xl font-semibold text-text">{selectedDeal.title}</h3>
                <p className="mt-2"><span className={`rounded-full border px-2 py-1 text-xs capitalize ${statusClass(selectedDeal.status)}`}>{labelFor(selectedDeal.status)}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Amount", money(selectedDeal.amount)],
                  ["Expected", money(selectedDeal.expected_value)],
                  ["Actual", money(selectedDeal.actual_value)],
                  ["Probability", `${Math.round((selectedDeal.probability || 0) * 100)}%`],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-soft bg-base p-3">
                    <p className="text-xs text-muted">{label as string}</p>
                    <p className="text-lg font-semibold text-text">{String(value)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted">Type: <span className="text-text capitalize">{labelFor(selectedDeal.deal_type)}</span></p>
                <p className="text-muted">Close date: <span className="text-text">{selectedDeal.close_date ? new Date(selectedDeal.close_date).toLocaleDateString() : "Not set"}</span></p>
                <p className="text-muted">Participants: <span className="text-text">{selectedDeal.participants.length}</span></p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Description</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedDeal.description || "No deal notes captured yet."}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a deal to review pipeline details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
