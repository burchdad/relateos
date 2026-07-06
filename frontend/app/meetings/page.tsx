"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { resolveApiUrl } from "@/components/api";
import type {
  Meeting,
  MeetingRecordingAnalysis,
  RecordingArtifact,
  RecordingArtifactSummary,
  RecordingTranscriptionResponse,
} from "@/components/types";

const MEDIA_EXTENSIONS = [".mp4", ".m4a", ".mp3", ".wav", ".mov", ".webm"];

const isMediaFile = (file: File) => {
  const name = file.name.toLowerCase();
  return file.type.startsWith("video/") || file.type.startsWith("audio/") || MEDIA_EXTENSIONS.some(ext => name.endsWith(ext));
};

const mediaArtifactType = (file: File) => {
  if (file.type.startsWith("video/") || file.name.toLowerCase().match(/\.(mp4|mov|webm)$/)) return "video";
  if (file.type.startsWith("audio/") || file.name.toLowerCase().match(/\.(m4a|mp3|wav)$/)) return "audio";
  return "media";
};

export default function MeetingsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [followups, setFollowups] = useState<Record<string, unknown> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [analyzingRecording, setAnalyzingRecording] = useState(false);
  const [recordingAnalysis, setRecordingAnalysis] = useState<MeetingRecordingAnalysis | null>(null);
  const [recordingAccessUrl, setRecordingAccessUrl] = useState("");
  const [savingAccessUrl, setSavingAccessUrl] = useState(false);
  const [recordingArtifacts, setRecordingArtifacts] = useState<RecordingArtifact[]>([]);
  const [artifactSummary, setArtifactSummary] = useState<RecordingArtifactSummary | null>(null);
  const [uploadingArtifacts, setUploadingArtifacts] = useState(false);
  const [transcribingArtifacts, setTranscribingArtifacts] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<RecordingTranscriptionResponse | null>(null);
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

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/meetings`, { cache: "no-store" });
      if (res.ok) setMeetings(await res.json());
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => { void fetchMeetings(); }, [fetchMeetings]);

  const fetchRecordingArtifacts = async (meetingId: string) => {
    const [artifactsRes, summaryRes] = await Promise.all([
      fetch(`${API_URL}/meetings/${meetingId}/recording-artifacts`, { cache: "no-store" }),
      fetch(`${API_URL}/meetings/${meetingId}/recording-artifacts/summary`, { cache: "no-store" }),
    ]);
    if (artifactsRes.ok) setRecordingArtifacts(await artifactsRes.json());
    if (summaryRes.ok) setArtifactSummary(await summaryRes.json());
  };

  const selectMeeting = async (meeting: Meeting) => {
    setSelected(meeting);
    setRecordingAccessUrl(meeting.meeting_url || "");
    setFollowups(null);
    setRecordingAnalysis(null);
    setRecordingArtifacts([]);
    setArtifactSummary(null);
    setTranscriptionResult(null);
    await fetchRecordingArtifacts(meeting.id);
  };

  const handleImportAttendees = async () => {
    if (!selected || !importText.trim()) return;
    setImporting(true);
    try {
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

  const handleAnalyzeRecording = async () => {
    if (!selected) return;
    setAnalyzingRecording(true);
    setRecordingAnalysis(null);
    try {
      const res = await fetch(`${API_URL}/meetings/analyze-recording/${selected.id}`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setRecordingAnalysis(body);
        const updated = await fetch(`${API_URL}/meetings/${selected.id}`, { cache: "no-store" });
        if (updated.ok) {
          const updatedMeeting = await updated.json();
          setSelected(updatedMeeting);
          setRecordingAccessUrl(updatedMeeting.meeting_url || "");
        }
        await fetchMeetings();
      } else {
        setRecordingAnalysis({
          meeting_id: selected.id,
          status: "error",
          message: String(body?.detail || "Could not analyze recording."),
          summary: null,
          action_items: [],
          participants: [],
          attendees_added: 0,
          contacts_created: 0,
          relationship_edges_created: 0,
          transcript_available: false,
          source_notes: [],
        });
      }
    } finally {
      setAnalyzingRecording(false);
    }
  };

  const handleSaveRecordingAccessUrl = async () => {
    if (!selected || !recordingAccessUrl.trim()) return;
    setSavingAccessUrl(true);
    try {
      const res = await fetch(`${API_URL}/meetings/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_url: recordingAccessUrl.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelected(updated);
        setRecordingAccessUrl(updated.meeting_url || "");
        await fetchMeetings();
      }
    } finally {
      setSavingAccessUrl(false);
    }
  };

  const handleArtifactUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !event.target.files?.length) return;
    setUploadingArtifacts(true);
    try {
      const files = Array.from(event.target.files);
      const mediaFiles = files.filter(isMediaFile);
      const textFiles = files.filter(file => !isMediaFile(file));

      for (const file of mediaFiles) {
        await upload(`recordings/${selected.id}/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          clientPayload: JSON.stringify({
            meetingId: selected.id,
            apiUrl: API_URL,
            fileName: file.name,
            contentType: file.type || null,
            artifactType: mediaArtifactType(file),
            fileSizeBytes: file.size,
          }),
        });
      }

      if (textFiles.length) {
        const formData = new FormData();
        textFiles.forEach(file => formData.append("files", file));
        const res = await fetch(`${API_URL}/meetings/${selected.id}/recording-artifacts/upload`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) return;
      }

      await fetchRecordingArtifacts(selected.id);
    } finally {
      setUploadingArtifacts(false);
      event.target.value = "";
    }
  };

  const handleTranscribePending = async () => {
    if (!selected) return;
    setTranscribingArtifacts(true);
    setTranscriptionResult(null);
    try {
      const res = await fetch(`${API_URL}/meetings/${selected.id}/recording-artifacts/transcribe-pending`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setTranscriptionResult(body);
        await fetchRecordingArtifacts(selected.id);
      } else {
        setTranscriptionResult({
          meeting_id: selected.id,
          processed: 0,
          transcripts_created: 0,
          skipped: 0,
          errors: [String(body?.detail || "Could not transcribe media.")],
          artifacts: [],
        });
      }
    } finally {
      setTranscribingArtifacts(false);
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
        return false;
      }
      setReportStatus(
        `Captured meeting ${body.meeting_id}: ${body.attendees_added} attendees, ${body.contacts_created} contacts, ${body.relationship_edges_created} graph edges.`
      );
      await fetchMeetings();
      return true;
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Could not capture meeting report.");
      return false;
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

    const captured = await ingestReportPayload({
      ...reportForm,
      title: reportForm.title.trim(),
      participants,
      action_items,
      auto_create_contacts: true,
    });

    if (captured) {
      setReportForm({ title: "", provider: "read_ai", platform: "zoom", meeting_url: "", summary: "", transcript: "" });
      setParticipantText("");
      setActionText("");
      setShowForm(false);
    }
  };

  const handleAdvancedJsonCapture = async () => {
    if (!reportJson.trim()) return;
    try {
      const parsed = JSON.parse(reportJson);
      const captured = await ingestReportPayload(parsed);
      if (captured) {
        setReportJson("");
        setShowForm(false);
      }
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Invalid JSON report.");
    }
  };

  const totalAttendees = meetings.reduce((sum, meeting) => sum + meeting.attendees.length, 0);
  const meetingsWithNotes = meetings.filter(meeting => meeting.transcript || meeting.summary).length;
  const needsReview = meetings.filter(meeting => !meeting.summary && !meeting.transcript && meeting.attendees.length === 0).length;
  const selectedArtifactCount = artifactSummary ? artifactSummary.total : 0;

  const captureModal = showForm ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-forest/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-xl border border-soft bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-soft px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Meeting Capture</p>
            <h3 className="mt-1 text-lg font-semibold text-text">Add meeting intelligence</h3>
            <p className="mt-1 text-sm text-muted">Paste notes, attendees, transcripts, or an exported AI report.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-lg border border-soft bg-base px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-5">
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
                <option value="skool">Skool</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input
              value={reportForm.meeting_url}
              onChange={e => setReportForm(p => ({ ...p, meeting_url: e.target.value }))}
              placeholder="Meeting link or recording URL"
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
              className="rounded-lg bg-accent border border-accent px-4 py-2 text-sm font-semibold text-forest transition hover:bg-accent/90 disabled:opacity-50"
            >
              {ingestingReport ? "Capturing..." : "Capture Meeting"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdvancedReport(v => !v)}
              className="rounded-lg border border-soft bg-base px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
            >
              {showAdvancedReport ? "Hide JSON" : "Advanced JSON"}
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
      </div>
    </div>
  ) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-accent">Meeting Intelligence</p>
          <h2 className="mt-1 text-2xl font-semibold text-text">Meetings</h2>
          <p className="text-sm text-muted mt-1">Review calls, transcripts, attendees, and follow-ups from one workspace.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-accent border border-accent px-4 py-2 text-sm font-semibold text-forest hover:bg-accent/90 transition">
          + Add Meeting
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Total meetings", meetings.length],
          ["Needs review", needsReview],
          ["With notes", meetingsWithNotes],
          ["Attendees", totalAttendees],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-soft bg-panel px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </div>

      {captureModal}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-soft bg-panel p-4">
          <h3 className="font-semibold text-text">Meeting Inbox</h3>
          <p className="mt-1 text-xs text-muted">Select a meeting to review notes, artifacts, attendees, and follow-up drafts.</p>

          <div className="mt-4 space-y-3">
            {loading && <p className="text-muted text-sm">Loading...</p>}
            {!loading && meetings.length === 0 && (
              <div className="rounded-lg border border-soft bg-base p-4">
                <p className="font-medium text-text text-sm">No meetings yet.</p>
                <p className="mt-1 text-xs text-muted">Connect Zoom or add meeting notes manually to start building relationship intelligence.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition"
                >
                  Add Meeting Notes
                </button>
              </div>
            )}
            {meetings.map(meeting => (
              <button
                type="button"
                key={meeting.id}
                onClick={() => { void selectMeeting(meeting); }}
                className={`w-full rounded-lg border p-4 text-left transition hover:border-accent/40 ${selected?.id === meeting.id ? "border-accent/70 bg-base" : "border-soft bg-base/70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text text-sm">{meeting.title}</p>
                    <p className="text-xs text-muted mt-1">{meeting.platform || "Meeting"} · {meeting.attendees.length} attendees</p>
                  </div>
                  <span className="rounded-full border border-soft bg-panel px-2 py-1 text-[11px] uppercase tracking-wide text-muted">
                    {meeting.summary || meeting.transcript ? "Notes" : "Raw"}
                  </span>
                </div>
                {meeting.scheduled_at && <p className="text-xs text-muted mt-2">{new Date(meeting.scheduled_at).toLocaleDateString()}</p>}
                {meeting.summary && <p className="mt-3 line-clamp-2 text-xs text-muted">{meeting.summary}</p>}
              </button>
            ))}
          </div>
        </section>

        {selected ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-soft bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-text mb-1">{selected.title}</h3>
                  <p className="text-xs text-muted">{selected.platform || "Meeting"} · {selected.attendees.length} attendees</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Artifacts", selectedArtifactCount],
                    ["Actions", selected.action_items?.length || 0],
                    ["People", selected.attendees.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-soft bg-base px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                      <p className="text-lg font-semibold text-text">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              {selected.summary && <p className="text-sm text-muted mt-3">{selected.summary}</p>}
              {selected.action_items?.length ? (
                <div className="mt-4 grid gap-2">
                  {selected.action_items.slice(0, 3).map(item => (
                    <p key={item} className="rounded-md border border-soft bg-base px-3 py-2 text-xs text-muted">{item}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-accent/30 bg-panel p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text text-sm">AI Recording Intelligence</p>
                  <p className="mt-1 text-xs text-muted">Scan captions, transcripts, or accessible replay media for participant signals, action items, summaries, and follow-up context.</p>
                </div>
                <button
                  onClick={handleAnalyzeRecording}
                  disabled={analyzingRecording || !selected.meeting_url}
                  className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50"
                >
                  {analyzingRecording ? "Analyzing..." : "Analyze Replay"}
                </button>
              </div>
              <div className="grid gap-2 rounded-lg border border-soft bg-base/60 p-3 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted">Recording access URL</label>
                  <input
                    value={recordingAccessUrl}
                    onChange={e => setRecordingAccessUrl(e.target.value)}
                    placeholder="Paste the Zoom recording or replay URL"
                    className="mt-2 w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
                  />
                  <p className="mt-2 text-xs text-muted">Use this when the meeting record needs a recording page before it can be analyzed.</p>
                </div>
                <button
                  onClick={handleSaveRecordingAccessUrl}
                  disabled={savingAccessUrl || !recordingAccessUrl.trim() || recordingAccessUrl.trim() === (selected.meeting_url || "")}
                  className="self-end rounded-lg border border-accent/40 bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/30 disabled:opacity-50"
                >
                  {savingAccessUrl ? "Saving..." : "Save URL"}
                </button>
              </div>
              {recordingAnalysis ? (
                <div className="grid gap-3">
                  <div className="rounded-lg border border-soft bg-base p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{recordingAnalysis.status.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-sm text-text">{recordingAnalysis.message}</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {[
                      ["Attendees added", recordingAnalysis.attendees_added],
                      ["Contacts created", recordingAnalysis.contacts_created],
                      ["Graph edges", recordingAnalysis.relationship_edges_created],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-soft bg-base p-3">
                        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                        <p className="mt-1 text-lg font-semibold text-text">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                  {recordingAnalysis.summary ? <p className="text-sm text-muted">{recordingAnalysis.summary}</p> : null}
                  {recordingAnalysis.action_items.length ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Action items</p>
                      <div className="mt-2 grid gap-2">
                        {recordingAnalysis.action_items.map(item => (
                          <p key={item} className="rounded-md border border-soft bg-base px-3 py-2 text-xs text-muted">{item}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {recordingAnalysis.source_notes.length ? (
                    <div className="grid gap-2">
                      {recordingAnalysis.source_notes.map(note => (
                        <p key={note} className="rounded-md border border-soft bg-base px-3 py-2 text-xs text-muted">{note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-soft bg-panel p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text text-sm">Recording Artifacts</p>
                  <p className="mt-1 text-xs text-muted">Upload Zoom chat, captions, transcripts, audio, or video files from the recording download menu.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleTranscribePending}
                    disabled={transcribingArtifacts || !artifactSummary?.pending_transcription}
                    className="rounded-lg border border-soft bg-base px-4 py-2 text-sm font-medium text-muted transition hover:text-text disabled:opacity-50"
                  >
                    {transcribingArtifacts ? "Transcribing..." : "Transcribe Media"}
                  </button>
                  <label className="cursor-pointer rounded-lg border border-accent/40 bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/30">
                    {uploadingArtifacts ? "Uploading..." : "Upload Files"}
                    <input
                      type="file"
                      multiple
                      accept=".txt,.vtt,.srt,.csv,.json,.mp4,.m4a,.mp3,.wav,.mov,.webm,text/*,audio/*,video/*"
                      onChange={handleArtifactUpload}
                      disabled={uploadingArtifacts}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              {transcriptionResult ? (
                <div className="rounded-lg border border-soft bg-base p-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Transcription</p>
                  <p className="mt-1 text-sm text-text">Processed {transcriptionResult.processed}; created {transcriptionResult.transcripts_created} transcript artifact(s).</p>
                  {transcriptionResult.errors.map(error => (
                    <p key={error} className="mt-1 text-xs text-muted">{error}</p>
                  ))}
                </div>
              ) : null}
              {artifactSummary ? (
                <div className="grid gap-2 md:grid-cols-4">
                  {[
                    ["Artifacts", artifactSummary.total],
                    ["Ready text", artifactSummary.ready_text],
                    ["Media pending", artifactSummary.pending_transcription],
                    ["Text chars", artifactSummary.text_characters],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-soft bg-base p-3">
                      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                      <p className="mt-1 text-lg font-semibold text-text">{String(value)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {recordingArtifacts.length ? (
                <div className="grid gap-2">
                  {recordingArtifacts.map(artifact => (
                    <div key={artifact.id} className="rounded-lg border border-soft bg-base px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text">{artifact.file_name || artifact.artifact_type}</p>
                        <span className="text-xs uppercase tracking-wide text-muted">{artifact.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{artifact.artifact_type} · {Math.round(artifact.file_size_bytes / 1024)} KB</p>
                      {artifact.extraction_notes.slice(0, 2).map(note => (
                        <p key={note} className="mt-1 text-xs text-muted">{note}</p>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">No files uploaded yet.</p>
              )}
            </div>

            <div className="rounded-xl border border-soft bg-panel p-5 space-y-3">
              <p className="font-medium text-text text-sm">Manual Attendee Fallback</p>
              <p className="text-xs text-muted">Paste rows as: Name, Email (one per line)</p>
              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={"John Smith, john@email.com\nJane Doe, jane@email.com"}
                className="w-full rounded-lg border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60 h-24 resize-none"
              />
              <button onClick={handleImportAttendees} disabled={importing || !importText.trim()}
                className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
                {importing ? "Importing..." : "Import Attendees"}
              </button>
            </div>

            {selected.attendees.length > 0 && (
              <div className="rounded-xl border border-soft bg-panel p-5">
                <p className="font-medium text-text text-sm mb-3">Attendees ({selected.attendees.length})</p>
                <div className="space-y-2">
                  {selected.attendees.map(attendee => (
                    <div key={attendee.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-text">{attendee.name || "-"}</span>
                        {attendee.email && <span className="text-muted ml-2">{attendee.email}</span>}
                      </div>
                      <span className={`text-xs capitalize ${attendee.followup_status === "sent" ? "text-green-700" : "text-muted"}`}>
                        {attendee.followup_status.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-soft bg-panel p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-text text-sm">AI Follow-Up Generator</p>
                <button onClick={handleGenerateFollowups} disabled={generating}
                  className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition disabled:opacity-50">
                  {generating ? "Generating..." : "Generate Follow-Ups"}
                </button>
              </div>
              {followups && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">Summary</p>
                    <p className="text-sm text-text">{String((followups as Record<string, unknown>).summary)}</p>
                  </div>
                  {Array.isArray((followups as Record<string, unknown>).followup_drafts) &&
                    ((followups as Record<string, unknown>).followup_drafts as Record<string, unknown>[]).slice(0, 3).map((draft, index) => (
                      <div key={index} className="rounded-lg border border-soft bg-base p-3 space-y-1">
                        <p className="text-xs font-medium text-accent">{String(draft.attendee_name)}</p>
                        <p className="text-xs text-muted font-medium">{String(draft.subject)}</p>
                        <p className="text-xs text-muted whitespace-pre-wrap">{String(draft.body)}</p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-soft bg-panel p-8">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Review Queue</p>
            <h3 className="mt-2 text-xl font-semibold text-text">Select a meeting to review intelligence.</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              This page is for what happens after a call: import notes, attach Zoom files, pull transcripts into usable assets, review attendees, and draft follow-ups.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                ["Capture", "Add notes, transcripts, attendees, and action items."],
                ["Analyze", "Attach recordings or transcript files and extract context."],
                ["Follow up", "Generate drafts tied to meeting participants."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-lg border border-soft bg-base p-4">
                  <p className="font-semibold text-text text-sm">{title}</p>
                  <p className="mt-1 text-xs text-muted">{copy}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
