"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Scoreboard, TopPartnerEntry } from "@/components/types";

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-soft bg-panel p-5">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-text mt-2">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function LeaderRow({ rank, name, score, revenue, deal_count, referral_count }: {
  rank: number; name: string; score: number; revenue: number; deal_count: number; referral_count: number;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  return (
    <tr className="border-b border-soft hover:bg-panel/50 transition">
      <td className="px-4 py-3 text-sm font-bold text-text">{medal}</td>
      <td className="px-4 py-3 text-sm font-medium text-text">{name}</td>
      <td className="px-4 py-3 text-sm text-accent font-semibold">{Math.round(score).toLocaleString()}</td>
      <td className="px-4 py-3 text-sm text-green-400">{revenue > 0 ? `$${revenue.toLocaleString()}` : "—"}</td>
      <td className="px-4 py-3 text-sm text-muted">{deal_count}</td>
      <td className="px-4 py-3 text-sm text-muted">{referral_count}</td>
    </tr>
  );
}

function PartnerList({ title, entries }: { title: string; entries: TopPartnerEntry[] }) {
  return (
    <div className="rounded-xl border border-soft bg-panel p-5">
      <h3 className="font-semibold text-text mb-4">{title}</h3>
      <div className="space-y-3">
        {entries.length === 0 && <p className="text-sm text-muted">No data yet.</p>}
        {entries.map((e, i) => (
          <div key={e.contact_id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted w-6 text-center">{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-text">{e.name}</p>
                <p className="text-xs text-muted">{e.deal_count} deals · {e.referral_count} referrals</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-green-400">${e.revenue.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScoreboardPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [data, setData] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/network/scoreboard`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted">Loading scoreboard…</div>;
  if (!data) return <div className="p-6 text-muted">Could not load scoreboard data.</div>;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-text">Network Scoreboard</h2>
        <p className="text-sm text-muted mt-1">Your network is becoming an asset. Top partners by money made together.</p>
      </div>

      {/* Revenue metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Network Revenue" value={`$${data.total_network_revenue.toLocaleString()}`} />
        <MetricCard label="Last 30 Days" value={`$${data.trailing_30_day_revenue.toLocaleString()}`} />
        <MetricCard label="Last 90 Days" value={`$${data.trailing_90_day_revenue.toLocaleString()}`} />
        <MetricCard label="Deals In Flight" value={data.deals_in_flight} sub={`$${data.referral_fees_pending.toLocaleString()} referral fees pending`} />
      </div>

      {/* Partner lists */}
      <div className="grid md:grid-cols-2 gap-6">
        <PartnerList title="Top Partners by Revenue" entries={data.top_partners_by_revenue} />
        <PartnerList title="Top Referrers" entries={data.top_referrers} />
      </div>

      {/* Gamification leaderboard */}
      <div className="rounded-xl border border-soft bg-panel">
        <div className="px-5 py-4 border-b border-soft">
          <h3 className="font-semibold text-text">Partner Leaderboard</h3>
          <p className="text-xs text-muted mt-1">Who is helping the web grow?</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-panel border-b border-soft">
              <tr>
                {["Rank", "Name", "Score", "Revenue", "Deals", "Referrals"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.gamification_leaderboard.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted text-sm">No data yet. Start logging deals to see the leaderboard.</td></tr>
              )}
              {data.gamification_leaderboard.map(e => (
                <LeaderRow key={e.contact_id} {...e} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most active contacts */}
      <div className="rounded-xl border border-soft bg-panel p-5">
        <h3 className="font-semibold text-text mb-4">Most Active Contacts by Lifetime Value</h3>
        <div className="space-y-3">
          {data.most_active_contacts.map((c, i) => (
            <div key={c.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted w-6 text-center">{i + 1}</span>
                <p className="text-sm font-medium text-text">{c.name}</p>
              </div>
              <span className="text-sm text-accent">{c.lifetime_value > 0 ? `$${c.lifetime_value.toLocaleString()}` : "—"}</span>
            </div>
          ))}
          {data.most_active_contacts.length === 0 && <p className="text-sm text-muted">No contacts yet.</p>}
        </div>
      </div>
    </div>
  );
}
