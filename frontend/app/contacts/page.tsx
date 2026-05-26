"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS, formatRole } from "@/components/roleTaxonomy";
import type { Contact } from "@/components/types";

const STAGES = ["new", "aware", "engaged", "active", "partner", "dormant", "high_value"];

export default function ContactsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    primary_role: "", source: "", relationship_stage: "", notes_summary: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (stageFilter) params.set("relationship_stage", stageFilter);
      const res = await fetch(`${API_URL}/contacts?${params}`, { cache: "no-store" });
      if (res.ok) setContacts(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, [search, roleFilter, stageFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ first_name: "", last_name: "", email: "", phone: "", primary_role: "", source: "", relationship_stage: "", notes_summary: "" });
        await fetchContacts();
      }
    } finally {
      setSaving(false);
    }
  };

  const stageColor = (stage: string | null) => {
    const map: Record<string, string> = {
      partner: "text-green-400", high_value: "text-yellow-400",
      active: "text-blue-400", dormant: "text-red-400", new: "text-muted",
    };
    return map[stage || ""] || "text-muted";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Contacts</h2>
          <p className="text-sm text-muted mt-1">Buyers, sellers, partners, vendors, community — your full network.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
          + Add Contact
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text" placeholder="Search name / email…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 w-56"
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Contact</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            {[
              ["first_name", "First Name", true],
              ["last_name", "Last Name", true],
              ["email", "Email", false],
              ["phone", "Phone", false],
            ].map(([f, label, req]) => (
              <input key={f as string} required={!!req} placeholder={label as string}
                value={(form as Record<string, string>)[f as string]}
                onChange={e => setForm(prev => ({ ...prev, [f as string]: e.target.value }))}
                className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            ))}
            <select value={form.primary_role} onChange={e => setForm(p => ({ ...p, primary_role: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none">
              <option value="">Select Role</option>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={form.relationship_stage} onChange={e => setForm(p => ({ ...p, relationship_stage: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none">
              <option value="">Select Stage</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <textarea placeholder="Notes…" value={form.notes_summary}
              onChange={e => setForm(p => ({ ...p, notes_summary: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-20 resize-none"
            />
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
                {saving ? "Saving…" : "Save Contact"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contacts list */}
      {loading ? (
        <p className="text-muted text-sm">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="text-muted text-sm">No contacts yet. Add your first contact above.</p>
      ) : (
        <div className="rounded-xl border border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel border-b border-soft">
              <tr>
                {["Name", "Role", "Stage", "Lifetime Value", "Email", "Source"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-panel/50 transition">
                  <td className="px-4 py-3 font-medium text-text">
                    {c.first_name} {c.last_name}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatRole(c.primary_role)}
                    {c.market_segment && c.market_segment !== "general" ? (
                      <span className="ml-2 rounded-full border border-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        {c.market_segment.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-4 py-3 capitalize font-medium ${stageColor(c.relationship_stage)}`}>
                    {c.relationship_stage || "—"}
                  </td>
                  <td className="px-4 py-3 text-text">{c.lifetime_value > 0 ? `$${c.lifetime_value.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-muted capitalize">{c.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
