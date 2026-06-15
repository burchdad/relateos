"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Organization } from "@/components/types";

const ORG_TYPES = ["tr3_core", "partner", "brokerage", "investor_group", "community", "vendor_company", "coaching_group", "other"];

const emptyForm = { name: "", org_type: "partner", description: "", website: "", location: "" };

const orgLabel = (type: string) => type.replace(/_/g, " ");

export default function OrganizationsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadSummary = useCallback(async (org: Organization) => {
    setSummary(null);
    const res = await fetch(`${API_URL}/organizations/${org.id}/network-summary`);
    if (res.ok) setSummary(await res.json());
  }, [API_URL]);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/organizations`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data);
        setSelectedOrg((current) => current ? data.find((org: Organization) => org.id === current.id) || current : data[0] || null);
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  useEffect(() => {
    if (selectedOrg) loadSummary(selectedOrg);
  }, [loadSummary, selectedOrg]);

  const filtered = orgs.filter(org => {
    const haystack = `${org.name} ${org.org_type} ${org.location || ""} ${org.description || ""}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesType = typeFilter === "all" || org.org_type === typeFilter;
    return matchesQuery && matchesType;
  });

  const stats = useMemo(() => {
    const partnerCount = orgs.filter(org => ["partner", "brokerage", "investor_group"].includes(org.org_type)).length;
    const vendors = orgs.filter(org => org.org_type === "vendor_company").length;
    const withWebsite = orgs.filter(org => org.website).length;
    const markets = new Set(orgs.map(org => org.location).filter(Boolean)).size;
    return { total: orgs.length, partnerCount, vendors, withWebsite, markets };
  }, [orgs]);

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
        setForm(emptyForm);
        await fetchOrgs();
      }
    } finally {
      setSaving(false);
    }
  };

  const selectOrg = (org: Organization) => {
    setSelectedOrg(org);
    loadSummary(org);
  };

  const orgTypeClass = (type: string) => {
    const map: Record<string, string> = {
      tr3_core: "border-accent/40 bg-accent/10 text-accent",
      partner: "border-blue-500/30 bg-blue-500/10 text-blue-200",
      brokerage: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
      investor_group: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      community: "border-green-500/30 bg-green-500/10 text-green-200",
      vendor_company: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    };
    return map[type] || "border-soft bg-soft/30 text-muted";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Partner network</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Partners</h2>
          <p className="text-sm text-muted mt-1">Manage companies, investor groups, brokerages, vendors, and community nodes.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 transition">
          Add Partner
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Organizations", stats.total],
          ["Partners", stats.partnerCount],
          ["Vendors", stats.vendors],
          ["With website", stats.withWebsite],
          ["Markets", stats.markets],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search partner, market, website, or notes"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="all">All types</option>
            {ORG_TYPES.map(type => <option key={type} value={type}>{orgLabel(type)}</option>)}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Partner / Organization</h3>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
            <input required placeholder="Organization name" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <select value={form.org_type} onChange={e => setForm(p => ({ ...p, org_type: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              {ORG_TYPES.map(type => <option key={type} value={type}>{orgLabel(type)}</option>)}
            </select>
            <input placeholder="Website" value={form.website}
              onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <input placeholder="Market or location" value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <textarea placeholder="Partnership notes" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="md:col-span-2 h-24 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
                {saving ? "Saving..." : "Save Partner"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-soft bg-panel overflow-hidden">
          <div className="grid grid-cols-[minmax(220px,1.3fr)_160px_180px_1fr] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
            <span>Partner</span>
            <span>Type</span>
            <span>Market</span>
            <span>Notes</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading partners...</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted">No partners match this view.</p>
          ) : (
            <div className="max-h-[680px] overflow-auto divide-y divide-soft">
              {filtered.map(org => (
                <button key={org.id} onClick={() => selectOrg(org)}
                  className={`grid w-full grid-cols-[minmax(220px,1.3fr)_160px_180px_1fr] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedOrg?.id === org.id ? "bg-accent/10" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-text">{org.name}</span>
                    <span className="block truncate text-xs text-muted">{org.website || "No website"}</span>
                  </span>
                  <span><span className={`rounded-full border px-2 py-1 text-xs capitalize ${orgTypeClass(org.org_type)}`}>{orgLabel(org.org_type)}</span></span>
                  <span className="truncate text-muted">{org.location || "Unassigned"}</span>
                  <span className="truncate text-muted">{org.description || "No notes captured"}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-soft bg-panel p-5 xl:sticky xl:top-6 xl:self-start">
          {selectedOrg ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Selected partner</p>
                <h3 className="mt-1 text-xl font-semibold text-text">{selectedOrg.name}</h3>
                <p className="mt-2"><span className={`rounded-full border px-2 py-1 text-xs capitalize ${orgTypeClass(selectedOrg.org_type)}`}>{orgLabel(selectedOrg.org_type)}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Contacts", summary?.contact_count ?? "-"],
                  ["Deals", summary?.deal_count ?? "-"],
                  ["Revenue", summary ? `$${Number(summary.total_revenue || 0).toLocaleString()}` : "-"],
                  ["Active", summary?.active_deals ?? "-"],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-soft bg-base p-3">
                    <p className="text-xs text-muted">{label as string}</p>
                    <p className="text-lg font-semibold text-text">{String(value)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted">Market: <span className="text-text">{selectedOrg.location || "Unassigned"}</span></p>
                <p className="text-muted">Website: {selectedOrg.website ? <a className="text-accent hover:underline" href={selectedOrg.website} target="_blank" rel="noopener noreferrer">{selectedOrg.website}</a> : <span className="text-text">Missing</span>}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Partnership notes</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedOrg.description || "No partnership notes captured yet."}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a partner to review network summary.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
