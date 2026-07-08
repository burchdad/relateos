"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import type { SupportAccessGrant, WorkspaceAdminOverview } from "@/components/types";

const healthDot: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const apiError = async (res: Response, fallback: string) => {
  const payload = (await res.json().catch(() => null)) as { detail?: string; message?: string } | null;
  return new Error(payload?.detail || payload?.message || fallback);
};

export default function WorkspaceAdminPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [overview, setOverview] = useState<WorkspaceAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [supportToken, setSupportToken] = useState("");
  const [creatingSupport, setCreatingSupport] = useState(false);
  const [supportForm, setSupportForm] = useState({
    label: "Support helper",
    access_level: "support_read",
    expires_in_hours: "24",
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/workspace-admin/overview`, { cache: "no-store" });
      if (!res.ok) throw await apiError(res, "Could not load workspace admin.");
      setOverview((await res.json()) as WorkspaceAdminOverview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workspace admin.");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const createSupportAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingSupport(true);
    setMessage("");
    setSupportToken("");
    try {
      const res = await fetch(`${API_URL}/workspace-admin/support-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: supportForm.label,
          access_level: supportForm.access_level,
          expires_in_hours: Number(supportForm.expires_in_hours) || 24,
        }),
      });
      if (!res.ok) throw await apiError(res, "Could not create support access.");
      const payload = (await res.json()) as { grant: SupportAccessGrant; token: string; message: string };
      setSupportToken(payload.token);
      setMessage(payload.message);
      await loadOverview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create support access.");
    } finally {
      setCreatingSupport(false);
    }
  };

  const revokeSupportAccess = async (grantId: string) => {
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/workspace-admin/support-access/${grantId}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Could not revoke support access.");
      setMessage("Support access revoked.");
      await loadOverview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke support access.");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="rounded-lg border border-soft bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Workspace controls</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">Workspace Admin</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted">
              Manage this workspace&apos;s team, security, support access, connectors, audit trail, and workspace defaults. This does not grant software-wide admin rights.
            </p>
          </div>
          <div className="rounded-lg border border-soft bg-base px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Your workspace role</p>
            <p className="mt-1 text-2xl font-semibold capitalize text-text">{overview?.current_role || "admin"}</p>
          </div>
        </div>
      </header>

      {message ? <p className="mt-4 rounded-lg border border-soft bg-white p-3 text-sm text-muted">{message}</p> : null}
      {loading ? <p className="mt-4 text-sm text-muted">Loading workspace admin...</p> : null}

      {overview ? (
        <>
          <section className="mt-4 grid gap-3 md:grid-cols-4">
            {overview.metrics.map(metric => (
              <div key={metric.label} className="rounded-lg border border-soft bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold text-text">{metric.value}</p>
                {metric.detail ? <p className="mt-1 text-xs text-muted">{metric.detail}</p> : null}
              </div>
            ))}
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-soft bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Team & Roles</h2>
                  <p className="mt-1 text-sm text-muted">Workspace admins manage members inside this workspace only.</p>
                </div>
                <Link href="/settings" className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Manage Team</Link>
              </div>
              <div className="mt-4 divide-y divide-soft rounded-md border border-soft bg-base">
                {overview.team_members.map(member => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-text">{member.name || member.email}</p>
                      <p className="text-xs text-muted">{member.email}</p>
                    </div>
                    <span className="rounded-full border border-soft bg-white px-2 py-1 text-xs capitalize text-muted">{member.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-soft bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Connector Health</h2>
                  <p className="mt-1 text-sm text-muted">Workspace integrations and sync state.</p>
                </div>
                <Link href="/connections" className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft/40">Open Connections</Link>
              </div>
              <div className="mt-4 grid gap-2">
                {overview.connectors.map(connector => {
                  const level = connector.health?.level || (connector.status === "ready" ? "green" : "red");
                  return (
                    <div key={connector.key} className="rounded-md border border-soft bg-base p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${healthDot[level] || healthDot.red}`} />
                          <p className="font-semibold text-text">{connector.name}</p>
                        </div>
                        <span className="text-xs capitalize text-muted">{connector.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">Last sync: {formatDate(connector.health?.last_sync_at || connector.last_updated_at)}</p>
                      {connector.health?.last_error ? <p className="mt-1 text-xs text-accent">{connector.health.last_error}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-lg border border-soft bg-panel p-5">
              <h2 className="text-lg font-semibold text-text">Audit Trail</h2>
              <p className="mt-1 text-sm text-muted">Recent workspace activity categories. Full detailed review lives in Settings for now.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {overview.audit_summary.length ? overview.audit_summary.map(item => (
                  <div key={item.label} className="rounded-md border border-soft bg-base p-3">
                    <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold text-text">{item.value}</p>
                  </div>
                )) : <p className="rounded-md border border-soft bg-base p-3 text-sm text-muted">No audited workspace actions yet.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-soft bg-panel p-5">
              <h2 className="text-lg font-semibold text-text">Support Access</h2>
              <p className="mt-1 text-sm text-muted">Create temporary, audited access for helper agents or support. Access is scoped to this workspace.</p>
              <div className="mt-3 rounded-md border border-soft bg-base p-3 text-xs text-muted">
                <p className="font-semibold text-text">Support can inspect health, review workspace summaries, and draft troubleshooting responses.</p>
                <p className="mt-1">Support cannot delete data, send messages, run imports, sync connectors, change permissions, or modify settings.</p>
              </div>
              <form onSubmit={createSupportAccess} className="mt-4 grid gap-3">
                <input
                  value={supportForm.label}
                  onChange={event => setSupportForm(prev => ({ ...prev, label: event.target.value }))}
                  className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
                  placeholder="Support helper label"
                />
                <select
                  value={supportForm.access_level}
                  onChange={event => setSupportForm(prev => ({ ...prev, access_level: event.target.value }))}
                  className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
                >
                  <option value="support_read">Support read-only</option>
                  <option value="support_assist">Support assist</option>
                </select>
                <select
                  value={supportForm.expires_in_hours}
                  onChange={event => setSupportForm(prev => ({ ...prev, expires_in_hours: event.target.value }))}
                  className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text focus:border-accent/60 focus:outline-none"
                >
                  <option value="8">8 hours</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
                <button disabled={creatingSupport} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:opacity-50">
                  {creatingSupport ? "Creating..." : "Create Support Access"}
                </button>
              </form>
              {supportToken ? (
                <div className="mt-4 rounded-md border border-accent/40 bg-honey-pale p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Copy once</p>
                  <p className="mt-2 break-all rounded-md border border-soft bg-white p-2 text-xs text-text">{supportToken}</p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-2">
                {overview.support_access.map(grant => (
                  <div key={grant.id} className="rounded-md border border-soft bg-base p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{grant.label}</p>
                        <p className="text-xs text-muted">{grant.access_level} | expires {formatDate(grant.expires_at)}</p>
                      </div>
                      <span className="rounded-full border border-soft bg-white px-2 py-1 text-xs capitalize text-muted">{grant.status}</span>
                    </div>
                    {grant.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => revokeSupportAccess(grant.id)}
                        className="mt-3 rounded-md border border-soft px-3 py-2 text-xs text-text hover:bg-soft/40"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
            <h2 className="text-lg font-semibold text-text">Workspace Defaults</h2>
            <p className="mt-1 text-sm text-muted">
              This is where workspace-level assistant tone, task rules, event invite defaults, and morning brief settings belong. Software behavior, deployments, and platform-wide controls stay out of workspace admin.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
