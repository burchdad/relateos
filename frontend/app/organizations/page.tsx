"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Organization } from "@/components/types";

const ORG_TYPES = ["tr3_core", "partner", "brokerage", "investor_group", "community", "vendor_company", "coaching_group", "other"];

export default function OrganizationsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", org_type: "partner", description: "", website: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/organizations`, { cache: "no-store" });
      if (res.ok) setOrgs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ name: "", org_type: "partner", description: "", website: "", location: "" });
        await fetchOrgs();
      }
    } finally {
      setSaving(false);
    }
  };

  const loadSummary = async (orgId: string) => {
    setSelectedOrg(orgId);
    setSummary(null);
    const res = await fetch(`${API_URL}/organizations/${orgId}/network-summary`);
    if (res.ok) setSummary(await res.json());
  };

  const orgTypeColor = (t: string) => {
    const map: Record<string, string> = {
      tr3_core: "text-accent",
      partner: "text-blue-400",
      investor_group: "text-yellow-400",
      community: "text-green-400",
    };
    return map[t] || "text-muted";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Partners & Organizations</h2>
          <p className="text-sm text-muted mt-1">TR3 network nodes — partner CRMs, investor groups, vendor companies.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
          + Add Organization
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Organization</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <input required placeholder="Organization Name" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <select value={form.org_type} onChange={e => setForm(p => ({ ...p, org_type: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none">
              {ORG_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <input placeholder="Website" value={form.website}
              onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <input placeholder="Location" value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <textarea placeholder="Description…" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-20 resize-none"
            />
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-muted text-sm">Loading organizations…</p>
      ) : orgs.length === 0 ? (
        <p className="text-muted text-sm">No organizations yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {orgs.map(org => (
            <div key={org.id} className={`rounded-xl border bg-panel p-5 cursor-pointer transition hover:border-accent/40 ${selectedOrg === org.id ? "border-accent/60" : "border-soft"}`}
              onClick={() => loadSummary(org.id)}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text">{org.name}</h3>
                  <p className={`text-xs capitalize mt-1 ${orgTypeColor(org.org_type)}`}>{org.org_type.replace(/_/g, " ")}</p>
                </div>
                {org.location && <span className="text-xs text-muted">{org.location}</span>}
              </div>
              {org.description && <p className="text-sm text-muted mt-2 line-clamp-2">{org.description}</p>}
              {org.website && <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-2 block" onClick={e => e.stopPropagation()}>{org.website}</a>}

              {selectedOrg === org.id && summary && (
                <div className="mt-4 pt-4 border-t border-soft grid grid-cols-2 gap-3">
                  {[
                    ["Contacts", (summary as Record<string, unknown>).contact_count],
                    ["Deals", (summary as Record<string, unknown>).deal_count],
                    ["Revenue", `$${Number((summary as Record<string, unknown>).total_revenue || 0).toLocaleString()}`],
                    ["Active Deals", (summary as Record<string, unknown>).active_deals],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xs text-muted">{k as string}</p>
                      <p className="text-lg font-bold text-text">{String(v)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
