"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import type {
  SupportAccessGrant,
  WorkspaceAdminOverview,
  WorkspaceAuditLog,
  WorkspacePolicySettings,
} from "@/components/types";

const healthDot: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};

const teamRoles = ["admin", "member", "viewer"];

const defaultPolicies: WorkspacePolicySettings = {
  daily_focus_digest: true,
  auto_create_contacts_from_meetings: true,
  require_review_before_bulk_send: true,
  require_confirmation_for_deletes: true,
  allow_members_to_import_contacts: false,
  allow_members_to_connect_integrations: false,
  assistant_tone: "concise",
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const titleize = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());

const apiError = async (res: Response, fallback: string) => {
  const payload = (await res.json().catch(() => null)) as { detail?: string; message?: string } | null;
  return new Error(payload?.detail || payload?.message || fallback);
};

export default function WorkspaceAdminPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [overview, setOverview] = useState<WorkspaceAdminOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<WorkspaceAuditLog[]>([]);
  const [policies, setPolicies] = useState<WorkspacePolicySettings>(defaultPolicies);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [supportToken, setSupportToken] = useState("");
  const [creatingSupport, setCreatingSupport] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [supportForm, setSupportForm] = useState({
    label: "Support helper",
    access_level: "support_read",
    expires_in_hours: "24",
  });

  const loadWorkspaceAdmin = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [overviewRes, auditRes, policiesRes] = await Promise.all([
        fetch(`${API_URL}/workspace-admin/overview`, { cache: "no-store" }),
        fetch(`${API_URL}/workspace-admin/audit-log?limit=40`, { cache: "no-store" }),
        fetch(`${API_URL}/workspace-admin/policies`, { cache: "no-store" }),
      ]);
      if (!overviewRes.ok) throw await apiError(overviewRes, "Could not load workspace admin.");
      if (!auditRes.ok) throw await apiError(auditRes, "Could not load workspace audit log.");
      if (!policiesRes.ok) throw await apiError(policiesRes, "Could not load workspace policies.");
      setOverview((await overviewRes.json()) as WorkspaceAdminOverview);
      setAuditLogs((await auditRes.json()) as WorkspaceAuditLog[]);
      setPolicies((await policiesRes.json()) as WorkspacePolicySettings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workspace admin.");
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    void loadWorkspaceAdmin();
  }, [loadWorkspaceAdmin]);

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
      await loadWorkspaceAdmin();
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
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke support access.");
    }
  };

  const inviteTeamMember = async () => {
    setTeamBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/team/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) throw await apiError(res, "Could not send invite.");
      setInviteEmail("");
      setInviteRole("member");
      setMessage("Team invite sent.");
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send invite.");
    } finally {
      setTeamBusy(false);
    }
  };

  const updateTeamRole = async (membershipId: string, role: string) => {
    setTeamBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/team/members/${membershipId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw await apiError(res, "Could not update role.");
      setMessage("Team role updated.");
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update role.");
    } finally {
      setTeamBusy(false);
    }
  };

  const removeTeamMember = async (membershipId: string) => {
    if (!window.confirm("Remove this member from the workspace?")) return;
    setTeamBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/team/members/${membershipId}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Could not remove member.");
      setMessage("Team member removed.");
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove member.");
    } finally {
      setTeamBusy(false);
    }
  };

  const revokeTeamInvite = async (inviteId: string) => {
    setTeamBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/team/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Could not revoke invite.");
      setMessage("Invite revoked.");
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke invite.");
    } finally {
      setTeamBusy(false);
    }
  };

  const updatePolicy = (key: keyof WorkspacePolicySettings, value: boolean | string) => {
    setPolicies(current => ({ ...current, [key]: value }));
  };

  const savePolicies = async () => {
    setPolicyBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/workspace-admin/policies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policies),
      });
      if (!res.ok) throw await apiError(res, "Could not save workspace policies.");
      setPolicies((await res.json()) as WorkspacePolicySettings);
      setMessage("Workspace policies saved.");
      await loadWorkspaceAdmin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save workspace policies.");
    } finally {
      setPolicyBusy(false);
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

          <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="rounded-lg border border-soft bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Team & Roles</h2>
                  <p className="mt-1 text-sm text-muted">Invite teammates, update roles, and remove access for this workspace only.</p>
                </div>
                <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">
                  {overview.team_members.length} members
                </span>
              </div>

              <div className="mt-4 grid gap-3 rounded-lg border border-soft bg-base p-4 md:grid-cols-[1fr_160px_auto]">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={event => setInviteEmail(event.target.value)}
                  placeholder="teammate@email.com"
                  className="rounded-md border border-soft bg-white px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
                />
                <select
                  value={inviteRole}
                  onChange={event => setInviteRole(event.target.value)}
                  className="rounded-md border border-soft bg-white px-3 py-2 text-sm outline-none focus:border-accent/60"
                >
                  {teamRoles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
                <button
                  type="button"
                  onClick={inviteTeamMember}
                  disabled={teamBusy || !inviteEmail.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-105 disabled:opacity-50"
                >
                  Send Invite
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-soft">
                <div className="grid gap-3 border-b border-soft bg-base px-4 py-2 text-xs uppercase tracking-wide text-muted md:grid-cols-[1.4fr_130px_110px_auto]">
                  <span>Member</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {overview.team_members.map(member => (
                  <div key={member.id} className="grid gap-3 border-b border-soft bg-white px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1.4fr_130px_110px_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{member.name || member.email}</p>
                      <p className="truncate text-xs text-muted">{member.email}</p>
                    </div>
                    {member.role !== "owner" ? (
                      <select
                        value={member.role}
                        onChange={event => updateTeamRole(member.id, event.target.value)}
                        disabled={teamBusy}
                        className="rounded-md border border-soft bg-base px-2 py-1.5 text-xs text-text"
                      >
                        {teamRoles.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-text">owner</span>
                    )}
                    <span className="w-fit rounded-full border border-soft bg-sage-pale px-2 py-1 text-xs text-forest">{member.status}</span>
                    <div className="md:text-right">
                      {member.role !== "owner" ? (
                        <button
                          type="button"
                          onClick={() => removeTeamMember(member.id)}
                          disabled={teamBusy}
                          className="rounded-md border border-soft bg-base px-3 py-1.5 text-xs font-medium text-text hover:bg-soft/30 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-muted">Protected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {overview.pending_invites.length ? (
                <div className="mt-4 rounded-lg border border-soft bg-base p-4">
                  <p className="text-sm font-semibold text-text">Pending invites</p>
                  <div className="mt-3 grid gap-2">
                    {overview.pending_invites.map(invite => (
                      <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-soft bg-white px-3 py-2 text-sm">
                        <span>
                          <span className="font-semibold text-text">{invite.invited_email}</span>
                          <span className="ml-2 text-xs text-muted">{invite.role} | expires {formatDate(invite.expires_at)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => revokeTeamInvite(invite.id)}
                          disabled={teamBusy}
                          className="rounded-md border border-soft bg-base px-3 py-1.5 text-xs font-medium text-text hover:bg-soft/30 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Audit Trail</h2>
                  <p className="mt-1 text-sm text-muted">What changed, who triggered it, and when it happened.</p>
                </div>
                <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">
                  {auditLogs.length} recent
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-soft">
                {auditLogs.length ? auditLogs.map(log => (
                  <div key={log.id} className="grid gap-2 border-b border-soft bg-white px-3 py-2 text-sm last:border-b-0 md:grid-cols-[190px_1fr_170px]">
                    <span className="font-semibold text-text">{titleize(log.action_type)}</span>
                    <span className="truncate text-muted">
                      {log.prompt || log.target_type || "Workspace action"}
                      {log.user_email ? <span className="ml-2 text-xs">by {log.user_name || log.user_email}</span> : null}
                    </span>
                    <span className="text-muted md:text-right">{formatDate(log.created_at)}</span>
                  </div>
                )) : (
                  <p className="bg-white px-3 py-3 text-sm text-muted">No audited workspace actions yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-soft bg-panel p-5">
              <h2 className="text-lg font-semibold text-text">Workspace Policies</h2>
              <p className="mt-1 text-sm text-muted">Default rules for automations and member capabilities.</p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-text">
                  Assistant tone
                  <select
                    value={policies.assistant_tone}
                    onChange={event => updatePolicy("assistant_tone", event.target.value)}
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
                  >
                    <option value="concise">Concise</option>
                    <option value="warm">Warm</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                {[
                  ["daily_focus_digest", "Daily morning brief"],
                  ["auto_create_contacts_from_meetings", "Create contacts from meetings"],
                  ["require_review_before_bulk_send", "Review bulk sends first"],
                  ["require_confirmation_for_deletes", "Confirm deletes"],
                  ["allow_members_to_import_contacts", "Members can import contacts"],
                  ["allow_members_to_connect_integrations", "Members can connect integrations"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-4 rounded-md border border-soft bg-base p-3 text-sm">
                    <span className="font-semibold text-text">{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(policies[key as keyof WorkspacePolicySettings])}
                      onChange={event => updatePolicy(key as keyof WorkspacePolicySettings, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={savePolicies}
                disabled={policyBusy}
                className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-105 disabled:opacity-50"
              >
                {policyBusy ? "Saving..." : "Save Policies"}
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
            <h2 className="text-lg font-semibold text-text">Workspace Data Controls</h2>
            <p className="mt-1 text-sm text-muted">
              Admins control this workspace&apos;s own data boundaries. Software deployment, app code, and platform-wide cleanup stay in Software Admin.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["Export workspace data", "Prepare contacts, meetings, tasks, events, deals, and content for download."],
                ["Import history", "Review imports and connector syncs that changed workspace records."],
                ["Scoped cleanup", "Future cleanup actions must preserve login users and stay inside this workspace."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-md border border-soft bg-base p-4">
                  <p className="font-semibold text-text">{title}</p>
                  <p className="mt-1 text-sm text-muted">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">Support Access</h2>
                <p className="mt-1 text-sm text-muted">Create temporary, audited access for helper agents or support. Access is scoped to this workspace.</p>
              </div>
              <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">
                {overview.support_access.filter(grant => grant.status === "active").length} active
              </span>
            </div>
            <div className="mt-3 rounded-md border border-soft bg-base p-3 text-xs text-muted">
              <p className="font-semibold text-text">Support can inspect health, review workspace summaries, and draft troubleshooting responses.</p>
              <p className="mt-1">Support cannot delete data, send messages, run imports, sync connectors, change permissions, or modify settings.</p>
            </div>
            <form onSubmit={createSupportAccess} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_140px_auto]">
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
                {creatingSupport ? "Creating..." : "Create Access"}
              </button>
            </form>
            {supportToken ? (
              <div className="mt-4 rounded-md border border-accent/40 bg-honey-pale p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Copy once</p>
                <p className="mt-2 break-all rounded-md border border-soft bg-white p-2 text-xs text-text">{supportToken}</p>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 md:grid-cols-2">
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
          </section>
        </>
      ) : null}
    </main>
  );
}
