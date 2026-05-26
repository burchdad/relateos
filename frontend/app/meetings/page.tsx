"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import type { Meeting } from "@/components/types";

export default function MeetingsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "zoom", meeting_url: "", transcript: "" });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [followups, setFollowups] = useState<Record<string, unknown> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportForm, setReportForm] = useState({
    title: "",
    provider: "read_ai",
    platform: "zoom",
    meeting_url: "",
    summary: "",
    transcript: "",
  });
  const [participantText, setParticipantText] = useState("");
  const [actionText, setActionText] = useState("");
  const [reportJson, setReportJson] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [ingestingReport, setIngestingReport] = useState(false);
  const [showAdvancedReport, setShowAdvancedReport] = useState(false);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/meetings`, { cache: "no-store" });
      if (res.ok) setMeetings(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ title: "", platform: "zoom", meeting_url: "", transcript: "" });
        await fetchMeetings();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleImportAttendees = async () => {
    if (!selected || !importText.trim()) return;
    setImporting(true);
    try {
      // Parse CSV-like pasted text: name,email
      const rows = importText.split("\n").filter(Boolean).map(line => {
        const [name, email] = line.split(",").map(s => s.trim());
        return { name, email, attendance_status: "attended" };
      });
      const res = await fetch(`${API_URL}/meetings/${selected.id}/attendees/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, auto_create_contacts: true }),
      });
      if (res.ok) {
        setImportText("");
        const updated = await fetch(`${API_URL}/meetings/${selected.id}`);
        if (updated.ok) setSelected(await updated.json());
      }
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateFollowups = async () => {
    if (!selected) return;
    setGenerating(true);
    setFollowups(null);
    try {
      const res = await fetch(`${API_URL}/meetings/${selected.id}/generate-followups`, { method: "POST" });
      if (res.ok) setFollowups(await res.json());
    } finally {
      setGenerating(false);
    }
  };

  const ingestReportPayload = async (payload: Record<string, unknown>) => {
    setIngestingReport(true);
    setReportStatus("");
    try {
      const res = await fetch(`${API_URL}/meetings/intelligence-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setReportStatus(String(body?.detail || "Failed to ingest meeting report."));
        return;
      }
      setReportStatus(
        `Captured meeting ${body.meeting_id}: ${body.attendees_added} attendees, ${body.contacts_created} contacts, ${body.relationship_edges_created} graph edges.`
      );
      await fetchMeetings();
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Could not capture meeting report.");
    } finally {
      setIngestingReport(false);
    }
  };

  const handleSimpleReportCapture = async () => {
    if (!reportForm.title.trim()) {
      setReportStatus("Add a meeting title before capturing.");
      return;
    }

    const participants = participantText.split("\n").map(line => {
      const [name = "", email = "", role = ""] = line.split(",").map(part => part.trim());
      return { name, email, role };
    }).filter(participant => participant.name || participant.email);

    const action_items = actionText.split("\n")
      .map(text => text.trim())
      .filter(Boolean)
      .map(text => ({ text }));

    await ingestReportPayload({
      ...reportForm,
      title: reportForm.title.trim(),
      participants,
      action_items,
      auto_create_contacts: true,
    });

    setReportForm({ title: "", provider: "read_ai", platform: "zoom", meeting_url: "", summary: "", transcript: "" });
    setParticipantText("");
    setActionText("");
  };

  const handleAdvancedJsonCapture = async () => {
    if (!reportJson.trim()) return;
    try {
      const parsed = JSON.parse(reportJson);
      await ingestReportPayload(parsed);
      setReportJson("");
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Invalid JSON report.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Meeting Intelligence</h2>
          <p className="text-sm text-muted mt-1">Import attendees, paste transcripts, and generate AI follow-ups.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
          + Add Meeting
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-accent/30 bg-panel p-5">
          <h3 className="font-semibold text-text mb-4">New Meeting / Webinar</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <input required placeholder="Meeting Title" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none">
              {["zoom", "google_meet", "teams", "other"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="Meeting URL" value={form.meeting_url}
              onChange={e => setForm(p => ({ ...p, meeting_url: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
            />
            <textarea placeholder="Paste transcript or notes…" value={form.transcript}
              onChange={e => setForm(p => ({ ...p, transcript: e.target.value }))}
              className="col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
            />
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted hover:text-text transition">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
                {saving ? "Saving…" : "Save Meeting"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-accent/30 bg-panel p-5 space-y-4">
        <div>
          <p className="font-medium text-text text-sm">Capture Meeting Notes</p>
          <p className="text-xs text-muted mt-1">
            Add a meeting summary, action items, and attendees. RelateOS will create contacts and update the network graph.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            required
            value={reportForm.title}
            onChange={e => setReportForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Meeting title"
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={reportForm.platform}
              onChange={e => setReportForm(p => ({ ...p, platform: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60"
            >
              {["zoom", "google_meet", "teams", "phone", "in_person", "other"].map(platform => (
                <option key={platform} value={platform}>{platform.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select
              value={reportForm.provider}
              onChange={e => setReportForm(p => ({ ...p, provider: e.target.value }))}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60"
            >
              <option value="read_ai">Read.ai</option>
              <option value="zoom_ai">Zoom AI</option>
              <option value="manual">Manual notes</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input
            value={reportForm.meeting_url}
            onChange={e => setReportForm(p => ({ ...p, meeting_url: e.target.value }))}
            placeholder="Meeting link"
            className="md:col-span-2 rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <textarea
            value={reportForm.summary}
            onChange={e => setReportForm(p => ({ ...p, summary: e.target.value }))}
            placeholder="Meeting summary"
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
          />
          <textarea
            value={participantText}
            onChange={e => setParticipantText(e.target.value)}
            placeholder={"Attendees: one per line\nAlex Lee, alex@example.com, SF Buyer\nMorgan Smith, morgan@example.com, CRE Seller"}
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
          />
          <textarea
            value={actionText}
            onChange={e => setActionText(e.target.value)}
            placeholder={"Action items: one per line\nSend deal packet\nSchedule follow-up call"}
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-24 resize-none"
          />
          <textarea
            value={reportForm.transcript}
            onChange={e => setReportForm(p => ({ ...p, transcript: e.target.value }))}
            placeholder="Transcript or raw notes"
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-24 resize-none"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSimpleReportCapture}
            disabled={ingestingReport || !reportForm.title.trim()}
            className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50"
          >
            {ingestingReport ? "Capturing..." : "Capture Meeting"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedReport(v => !v)}
            className="px-3 py-2 text-xs text-muted hover:text-text transition"
          >
            {showAdvancedReport ? "Hide advanced JSON" : "Advanced JSON"}
          </button>
          {reportStatus ? <p className="text-xs text-muted">{reportStatus}</p> : null}
        </div>
        {showAdvancedReport && (
          <div className="rounded-lg border border-soft bg-base/60 p-3 space-y-3">
            <textarea
              value={reportJson}
              onChange={e => setReportJson(e.target.value)}
              placeholder='{"provider":"read_ai","title":"Investor call","summary":"...","action_items":[{"text":"Send deal packet"}],"participants":[{"name":"Alex Lee","email":"alex@example.com"}]}'
              className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-28 resize-none"
            />
            <button
              onClick={handleAdvancedJsonCapture}
              disabled={ingestingReport || !reportJson.trim()}
              className="rounded-lg bg-soft/30 border border-soft px-4 py-2 text-sm font-medium text-muted hover:text-text transition disabled:opacity-50"
            >
              Capture JSON
            </button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Meeting list */}
        <div className="space-y-3">
          {loading && <p className="text-muted text-sm">Loading…</p>}
          {!loading && meetings.length === 0 && <p className="text-muted text-sm">No meetings yet.</p>}
          {meetings.map(m => (
            <div key={m.id} onClick={() => { setSelected(m); setFollowups(null); }}
              className={`rounded-xl border p-4 cursor-pointer transition hover:border-accent/40 ${selected?.id === m.id ? "border-accent/60 bg-panel" : "border-soft bg-panel/50"}`}>
              <p className="font-medium text-text text-sm">{m.title}</p>
              <p className="text-xs text-muted mt-1">{m.platform || "Meeting"} · {m.attendees.length} attendees</p>
              {m.scheduled_at && <p className="text-xs text-muted mt-1">{new Date(m.scheduled_at).toLocaleDateString()}</p>}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="md:col-span-2 space-y-5">
            <div className="rounded-xl border border-soft bg-panel p-5">
              <h3 className="font-semibold text-text mb-1">{selected.title}</h3>
              <p className="text-xs text-muted">{selected.platform} · {selected.attendees.length} attendees</p>
              {selected.summary && <p className="text-sm text-muted mt-3">{selected.summary}</p>}
            </div>

            {/* Import attendees */}
            <div className="rounded-xl border border-soft bg-panel p-5 space-y-3">
              <p className="font-medium text-text text-sm">Import Attendees</p>
              <p className="text-xs text-muted">Paste rows as: Name, Email (one per line)</p>
              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={"John Smith, john@email.com\nJane Doe, jane@email.com"}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-24 resize-none"
              />
              <button onClick={handleImportAttendees} disabled={importing || !importText.trim()}
                className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
                {importing ? "Importing…" : "Import Attendees"}
              </button>
            </div>

            {/* Attendees */}
            {selected.attendees.length > 0 && (
              <div className="rounded-xl border border-soft bg-panel p-5">
                <p className="font-medium text-text text-sm mb-3">Attendees ({selected.attendees.length})</p>
                <div className="space-y-2">
                  {selected.attendees.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-text">{a.name || "—"}</span>
                        {a.email && <span className="text-muted ml-2">{a.email}</span>}
                      </div>
                      <span className={`text-xs capitalize ${a.followup_status === "sent" ? "text-green-400" : "text-muted"}`}>
                        {a.followup_status.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate follow-ups */}
            <div className="rounded-xl border border-soft bg-panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-text text-sm">AI Follow-Up Generator</p>
                <button onClick={handleGenerateFollowups} disabled={generating}
                  className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
                  {generating ? "Generating…" : "Generate Follow-Ups"}
                </button>
              </div>
              {followups && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">Summary</p>
                    <p className="text-sm text-text">{String((followups as Record<string, unknown>).summary)}</p>
                  </div>
                  {Array.isArray((followups as Record<string, unknown>).followup_drafts) &&
                    ((followups as Record<string, unknown>).followup_drafts as Record<string, unknown>[]).slice(0, 3).map((d, i) => (
                      <div key={i} className="rounded-lg border border-soft bg-base p-3 space-y-1">
                        <p className="text-xs font-medium text-accent">{String(d.attendee_name)}</p>
                        <p className="text-xs text-muted font-medium">{String(d.subject)}</p>
                        <p className="text-xs text-muted whitespace-pre-wrap">{String(d.body)}</p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
