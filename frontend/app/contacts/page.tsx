"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS, formatRole } from "@/components/roleTaxonomy";
import type { Contact } from "@/components/types";

const STAGES = ["new", "aware", "engaged", "active", "partner", "dormant", "high_value"];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  primary_role: "",
  source: "",
  relationship_stage: "",
  notes_summary: "",
};

const compactName = (contact: Contact) => {
  const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  return name || contact.email || "Unknown contact";
};

const initialsFor = (contact: Contact) => compactName(contact).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

export default function ContactsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (stageFilter) params.set("relationship_stage", stageFilter);
      const res = await fetch(`${API_URL}/contacts?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
        setSelectedContact((current) => current ? data.find((c: Contact) => c.id === current.id) || current : data[0] || null);
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL, roleFilter, search, stageFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const stats = useMemo(() => {
    const withEmail = contacts.filter(c => c.email).length;
    const withRole = contacts.filter(c => c.primary_role && c.primary_role !== "unknown").length;
    const active = contacts.filter(c => ["active", "partner", "high_value"].includes(c.relationship_stage || "")).length;
    const needsCleanup = contacts.filter(c => compactName(c).toLowerCase().includes("unknown") || !c.primary_role || !c.email).length;
    return { total: contacts.length, withEmail, withRole, active, needsCleanup };
  }, [contacts]);

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
        setForm(emptyForm);
        await fetchContacts();
      }
    } finally {
      setSaving(false);
    }
  };

  const stageClass = (stage: string | null) => {
    const map: Record<string, string> = {
      partner: "border-green-500/30 bg-green-500/10 text-green-300",
      high_value: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      active: "border-blue-500/30 bg-blue-500/10 text-blue-200",
      dormant: "border-red-500/30 bg-red-500/10 text-red-200",
      new: "border-soft bg-soft/30 text-muted",
    };
    return map[stage || ""] || "border-soft bg-soft/30 text-muted";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">Network CRM</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Contacts</h2>
          <p className="text-sm text-muted mt-1">Clean, segment, and work the people in the network.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:brightness-110 transition">
          Add Contact
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Total", stats.total],
          ["With email", stats.withEmail],
          ["Role tagged", stats.withRole],
          ["Active", stats.active],
          ["Needs cleanup", stats.needsCleanup],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-soft bg-panel p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
          <input
            type="text"
            placeholder="Search name, email, or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Contact</h3>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
            {[
              ["first_name", "First name", true],
              ["last_name", "Last name", true],
              ["email", "Email", false],
              ["phone", "Phone", false],
            ].map(([field, label, required]) => (
              <input key={field as string} required={!!required} placeholder={label as string}
                value={(form as Record<string, string>)[field as string]}
                onChange={e => setForm(prev => ({ ...prev, [field as string]: e.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
              />
            ))}
            <select value={form.primary_role} onChange={e => setForm(p => ({ ...p, primary_role: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              <option value="">Select role</option>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={form.relationship_stage} onChange={e => setForm(p => ({ ...p, relationship_stage: e.target.value }))}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
              <option value="">Select stage</option>
              {STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
            <textarea placeholder="Notes" value={form.notes_summary}
              onChange={e => setForm(p => ({ ...p, notes_summary: e.target.value }))}
              className="md:col-span-2 h-24 resize-none rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50">
                {saving ? "Saving..." : "Save Contact"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-lg border border-soft bg-panel overflow-hidden">
          <div className="grid grid-cols-[minmax(220px,1.4fr)_170px_130px_minmax(220px,1fr)_120px] border-b border-soft bg-base/60 px-4 py-3 text-xs uppercase tracking-wide text-muted">
            <span>Name</span>
            <span>Role</span>
            <span>Stage</span>
            <span>Contact</span>
            <span>Source</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading contacts...</p>
          ) : contacts.length === 0 ? (
            <p className="p-4 text-sm text-muted">No contacts match this view.</p>
          ) : (
            <div className="max-h-[680px] overflow-auto divide-y divide-soft">
              {contacts.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`grid w-full grid-cols-[minmax(220px,1.4fr)_170px_130px_minmax(220px,1fr)_120px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft/20 ${selectedContact?.id === contact.id ? "bg-accent/10" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-soft bg-base text-xs font-semibold text-accent">{initialsFor(contact)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">{compactName(contact)}</span>
                      <span className="block truncate text-xs text-muted">{contact.phone || "No phone"}</span>
                    </span>
                  </span>
                  <span className="truncate text-muted">{formatRole(contact.primary_role)}</span>
                  <span><span className={`rounded-full border px-2 py-1 text-xs capitalize ${stageClass(contact.relationship_stage)}`}>{contact.relationship_stage || "unset"}</span></span>
                  <span className="truncate text-muted">{contact.email || "No email"}</span>
                  <span className="truncate text-muted capitalize">{contact.source || "-"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-soft bg-panel p-5">
          {selectedContact ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Selected contact</p>
                <h3 className="mt-1 text-xl font-semibold text-text">{compactName(selectedContact)}</h3>
                <p className="mt-1 text-sm text-muted">{formatRole(selectedContact.primary_role)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-soft bg-base p-3">
                  <p className="text-xs text-muted">Strength</p>
                  <p className="text-lg font-semibold text-text">{selectedContact.relationship_strength_score.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-soft bg-base p-3">
                  <p className="text-xs text-muted">Value</p>
                  <p className="text-lg font-semibold text-text">${selectedContact.lifetime_value.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-muted">Email: <span className="text-text">{selectedContact.email || "Missing"}</span></p>
                <p className="text-muted">Phone: <span className="text-text">{selectedContact.phone || "Missing"}</span></p>
                <p className="text-muted">Stage: <span className="text-text capitalize">{selectedContact.relationship_stage || "Unset"}</span></p>
                <p className="text-muted">Segment: <span className="text-text">{(selectedContact.market_segment || "general").replace(/_/g, " ")}</span></p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
                <p className="mt-2 rounded-lg border border-soft bg-base p-3 text-sm text-muted">{selectedContact.notes_summary || "No notes captured yet."}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a contact to review details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
