"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import { AgentSyncResponse, ConnectionsOverview, ConnectorStatus } from "@/components/types";

type DraftValues = Record<string, Record<string, string>>;

const STATUS_STYLES: Record<ConnectorStatus["status"], string> = {
  ready: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  partial: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  needs_config: "border-amber-400/30 bg-amber-400/10 text-amber-200",
};

const CONNECTOR_ORDER = ["zoom", "google_calendar", "skool", "read_ai", "openai"];

const apiError = async (res: Response, fallback: string) => {
  const payload = (await res.json().catch(() => null)) as { detail?: string; message?: string } | null;
  return new Error(payload?.detail || payload?.message || `${fallback} (${res.status})`);
};

export default function ConnectionsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [overview, setOverview] = useState<ConnectionsOverview | null>(null);
  const [drafts, setDrafts] = useState<DraftValues>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [syncResult, setSyncResult] = useState<AgentSyncResponse | null>(null);
  const [syncing, setSyncing] = useState<AgentSyncResponse["mode"] | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/connections`, { cache: "no-store" });
      if (!res.ok) throw await apiError(res, "Could not load connections");
      const data = (await res.json()) as ConnectionsOverview;
      data.connectors.sort((a, b) => CONNECTOR_ORDER.indexOf(a.key) - CONNECTOR_ORDER.indexOf(b.key));
      setOverview(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load connections");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const updateDraft = (connector: string, field: string, value: string) => {
    setDrafts(prev => ({
      ...prev,
      [connector]: {
        ...(prev[connector] || {}),
        [field]: value,
      },
    }));
  };

  const saveConnector = async (connector: ConnectorStatus) => {
    setSaving(prev => ({ ...prev, [connector.key]: true }));
    setMessage("");
    try {
      const values = drafts[connector.key] || {};
      const res = await fetch(`${API_URL}/connections/${connector.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw await apiError(res, `Could not save ${connector.name}`);
      const payload = (await res.json()) as { connector: ConnectorStatus; message: string };
      setMessage(payload.message);
      setDrafts(prev => ({ ...prev, [connector.key]: {} }));
      await loadConnections();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not save ${connector.name}`);
    } finally {
      setSaving(prev => ({ ...prev, [connector.key]: false }));
    }
  };

  const runSync = async (mode: AgentSyncResponse["mode"]) => {
    setSyncing(mode);
    setMessage("");
    setSyncResult(null);
    try {
      const res = await fetch(`${API_URL}/connections/agent-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw await apiError(res, "Could not start agent sync");
      const data = (await res.json()) as AgentSyncResponse;
      setSyncResult(data);
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start agent sync");
    } finally {
      setSyncing(null);
    }
  };

  const runZoomSync = async () => {
    setSyncing("archive");
    setMessage("");
    setSyncResult(null);
    try {
      const res = await fetch(`${API_URL}/connections/zoom/sync`, { method: "POST" });
      if (!res.ok) throw await apiError(res, "Could not sync Zoom recordings");
      const data = (await res.json()) as AgentSyncResponse;
      setSyncResult(data);
      setMessage(data.message);
      await loadConnections();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync Zoom recordings");
    } finally {
      setSyncing(null);
    }
  };

  const runZoomAiSync = async () => {
    setSyncing("archive");
    setMessage("");
    setSyncResult(null);
    try {
      const res = await fetch(`${API_URL}/connections/zoom/ai-companion/sync`, { method: "POST" });
      if (!res.ok) throw await apiError(res, "Could not sync Zoom AI notes");
      const data = (await res.json()) as AgentSyncResponse;
      setSyncResult(data);
      setMessage(data.message);
      await loadConnections();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync Zoom AI notes");
    } finally {
      setSyncing(null);
    }
  };

  const startOAuth = async (connectorKey: ConnectorStatus["key"]) => {
    const path =
      connectorKey === "zoom"
        ? "zoom/oauth/start"
        : connectorKey === "google_calendar"
          ? "google-calendar/oauth/start"
          : "";
    if (!path) return;
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/connections/${path}`);
      if (!res.ok) throw await apiError(res, "Could not start connection flow");
      const payload = (await res.json()) as { auth_url: string };
      window.location.href = payload.auth_url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start connection flow");
    }
  };

  const readyConnectors = overview?.connectors.filter(connector => connector.status === "ready").length || 0;
  const totalConnectors = overview?.connectors.length || 0;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="rounded-lg border border-soft bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS agent hub</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">Connections</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted">
              Bypass Zapier by letting RelateOS connect directly to Skool, Zoom, Read.ai, and AI generation.
            </p>
          </div>
          <div className="rounded-lg border border-soft bg-base px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Ready connectors</p>
            <p className="mt-1 text-2xl font-semibold text-text">{readyConnectors}/{totalConnectors}</p>
          </div>
        </div>
      </header>

      <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-text">Automation Pipeline</h2>
            <p className="mt-1 text-sm text-muted">{overview?.recommended_next_step || "Loading connector plan..."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runZoomSync}
              disabled={Boolean(syncing)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:opacity-50"
            >
              {syncing === "archive" ? "Syncing..." : "Sync Zoom Recordings"}
            </button>
            <button
              onClick={runZoomAiSync}
              disabled={Boolean(syncing)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:opacity-50"
            >
              {syncing === "archive" ? "Syncing..." : "Sync Zoom AI Notes"}
            </button>
            <button
              onClick={() => runSync("archive")}
              disabled={Boolean(syncing)}
              className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {syncing === "archive" ? "Starting..." : "Sync Archive"}
            </button>
            <button
              onClick={() => runSync("live_session")}
              disabled={Boolean(syncing)}
              className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {syncing === "live_session" ? "Preparing..." : "Prepare Live Watcher"}
            </button>
            <button
              onClick={() => runSync("full")}
              disabled={Boolean(syncing)}
              className="rounded-md border border-soft px-4 py-2 text-sm text-text hover:bg-soft/40 disabled:opacity-50"
            >
              {syncing === "full" ? "Starting..." : "Full Sync"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {(overview?.pipeline || []).map(step => (
            <p key={step} className="rounded-md border border-soft bg-base px-3 py-3 text-xs text-muted">{step}</p>
          ))}
        </div>
        {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
        {syncResult?.blockers.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {syncResult.blockers.map(blocker => (
              <p key={blocker} className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                {blocker}
              </p>
            ))}
          </div>
        ) : null}
        {syncResult && !syncResult.blockers.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {[
              ["Status", syncResult.status],
              ["Recordings found", syncResult.recordings_found_count],
              ["AI notes found", syncResult.ai_notes_found_count],
              ["Content imported", syncResult.imported_content_count],
              ["Meetings imported", syncResult.imported_meeting_count],
              ["Attendees imported", syncResult.imported_attendee_count],
              ["Artifacts imported", syncResult.imported_artifact_count],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-soft bg-base px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 text-sm font-semibold text-text">{String(value).replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        ) : null}
        {syncResult?.errors.length ? (
          <div className="mt-3 grid gap-2">
            {syncResult.errors.slice(0, 4).map(error => (
              <p key={error} className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                {error}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {loading ? <p className="mt-6 text-sm text-muted">Loading connections...</p> : null}

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        {(overview?.connectors || []).map(connector => (
          <article key={connector.key} className="rounded-lg border border-soft bg-panel p-5">
            {(() => {
              const oauthConnected =
                (connector.key === "zoom" || connector.key === "google_calendar") &&
                connector.configured_fields.includes("refresh_token");
              return (
                <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">{connector.name}</h2>
                <p className="mt-1 text-sm text-muted">{connector.purpose}</p>
                {oauthConnected ? (
                  <p className="mt-2 rounded-md border border-sage/40 bg-sage-pale px-3 py-2 text-xs font-semibold text-text">
                    OAuth connected for this workspace.
                  </p>
                ) : null}
              </div>
              <span className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide ${STATUS_STYLES[connector.status]}`}>
                {connector.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {connector.fields.map(field => {
                const configured = connector.configured_fields.includes(field.key);
                if ((connector.key === "zoom" || connector.key === "google_calendar") && ["access_token", "refresh_token"].includes(field.key)) {
                  return null;
                }
                if (connector.key === "zoom" && oauthConnected && ["account_id", "client_id", "client_secret"].includes(field.key)) {
                  return null;
                }
                return (
                  <label key={field.key} className="grid gap-1">
                    <span className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{field.label}</span>
                      {configured ? <span className="text-emerald-200">Configured</span> : null}
                    </span>
                    <input
                      type={field.secret ? "password" : "text"}
                      value={drafts[connector.key]?.[field.key] || ""}
                      onChange={event => updateDraft(connector.key, field.key, event.target.value)}
                      placeholder={configured ? "Leave blank to keep existing value" : field.placeholder}
                      className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Missing: {connector.missing_fields.length ? connector.missing_fields.join(", ") : "none"}
              </p>
              <div className="flex flex-wrap gap-2">
                {connector.key === "zoom" || connector.key === "google_calendar" ? (
                  <button
                    onClick={() => startOAuth(connector.key)}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110"
                  >
                    {connector.status === "ready" ? `Reconnect ${connector.name}` : `Connect ${connector.name}`}
                  </button>
                ) : null}
                <button
                  onClick={() => saveConnector(connector)}
                  disabled={saving[connector.key] || !Object.values(drafts[connector.key] || {}).some(Boolean)}
                  className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
                >
                  {saving[connector.key] ? "Saving..." : "Save Connector"}
                </button>
              </div>
            </div>
                </>
              );
            })()}
          </article>
        ))}
      </section>
    </main>
  );
}
