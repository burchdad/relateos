"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Deal, NaturalLanguageDealResult } from "@/components/types";

const STATUSES = ["idea", "lead", "contacted", "qualified", "active", "under_contract", "closed_won", "closed_lost", "dormant"];
const DEAL_TYPES = ["buyer_lead", "seller_lead", "referral", "coaching", "investment", "property", "vendor", "sponsorship", "podcast_funnel", "community_membership", "other"];

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    closed_won: "text-green-400 bg-green-400/10 border-green-400/30",
    closed_lost: "text-red-400 bg-red-400/10 border-red-400/30",
    active: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    lead: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  };
  return map[status] || "text-muted bg-soft/20 border-soft";
};

export default function DealsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [nlInput, setNlInput] = useState("");
  const [nlResult, setNlResult] = useState<NaturalLanguageDealResult | null>(null);
  const [nlParsing, setNlParsing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("deal_type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`${API_URL}/deals?${params}`, { cache: "no-store" });
      if (res.ok) setDeals(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeals(); }, [typeFilter, statusFilter]);

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

  const totalRevenue = deals.filter(d => d.status === "closed_won").reduce((s, d) => s + d.actual_value, 0);
  const inFlight = deals.filter(d => !["closed_won", "closed_lost", "dormant"].includes(d.status)).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text">Deals</h2>
        <p className="text-sm text-muted mt-1">Track deal flow, revenue splits, and referral fees.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}` },
          { label: "Deals In Flight", value: inFlight },
          { label: "Total Deals", value: deals.length },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-soft bg-panel p-4">
            <p className="text-xs text-muted uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-bold text-text mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Natural Language Logger */}
      <div className="rounded-xl border border-accent/30 bg-panel p-5 space-y-3">
        <p className="text-sm font-semibold text-text">Log a Deal with Natural Language</p>
        <p className="text-xs text-muted">e.g. &quot;Closed 15K coaching deal with Darian, split 50/50, March 12&quot;</p>
        <div className="flex gap-3">
          <input
            type="text" value={nlInput} onChange={e => setNlInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleNlParse()}
            placeholder='Describe the deal in plain language…'
            className="flex-1 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <button onClick={handleNlParse} disabled={nlParsing || !nlInput.trim()}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
            {nlParsing ? "Parsing…" : "Parse"}
          </button>
        </div>

        {nlResult && (
          <div className="rounded-lg border border-soft bg-base p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text">Parsed Preview</p>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${nlResult.confidence >= 0.8 ? "text-green-400 bg-green-400/10 border-green-400/30" : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"}`}>
                {Math.round(nlResult.confidence * 100)}% confidence
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["Title", nlResult.parsed.title],
                ["Type", nlResult.parsed.deal_type],
                ["Status", nlResult.parsed.status],
                ["Amount", nlResult.parsed.amount ? `$${Number(nlResult.parsed.amount).toLocaleString()}` : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <span className="text-muted">{k}: </span>
                  <span className="text-text capitalize">{String(v || "—")}</span>
                </div>
              ))}
            </div>
            {nlResult.missing_fields.length > 0 && (
              <p className="text-xs text-yellow-400">Missing: {nlResult.missing_fields.join(", ")}</p>
            )}
            <div className="flex gap-3">
              <button onClick={handleConfirmDeal} className="rounded-lg bg-green-400/10 border border-green-400/30 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-400/20 transition">
                Confirm & Save
              </button>
              <button onClick={() => setNlResult(null)} className="px-4 py-2 text-sm text-muted hover:text-text transition">
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
          <option value="">All Types</option>
          {DEAL_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {/* Deal list */}
      {loading ? (
        <p className="text-muted text-sm">Loading deals…</p>
      ) : deals.length === 0 ? (
        <p className="text-muted text-sm">No deals yet. Log your first deal above.</p>
      ) : (
        <div className="rounded-xl border border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel border-b border-soft">
              <tr>
                {["Title", "Type", "Status", "Amount", "Actual", "Participants", "Close Date"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft">
              {deals.map(d => (
                <tr key={d.id} className="hover:bg-panel/50 transition">
                  <td className="px-4 py-3 font-medium text-text max-w-[180px] truncate">{d.title}</td>
                  <td className="px-4 py-3 text-muted capitalize">{d.deal_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${statusColor(d.status)}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text">{d.amount > 0 ? `$${d.amount.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-green-400">{d.actual_value > 0 ? `$${d.actual_value.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-muted">{d.participants.length}</td>
                  <td className="px-4 py-3 text-muted">{d.close_date ? new Date(d.close_date).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
