"use client";

import { FormEvent, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";
import type { SoftwareAdminOverview } from "@/components/types";

const TOKEN_STORAGE_KEY = "relateos_software_admin_token";

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const apiError = async (res: Response, fallback: string) => {
  const payload = (await res.json().catch(() => null)) as { detail?: string; message?: string } | null;
  return new Error(payload?.detail || payload?.message || fallback);
};

export default function SoftwareAdminPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
  });
  const [overview, setOverview] = useState<SoftwareAdminOverview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadOverview = async (nextToken = token) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/software-admin/overview`, {
        cache: "no-store",
        headers: { "X-Software-Admin-Token": nextToken },
      });
      if (!res.ok) throw await apiError(res, "Could not open software admin.");
      const payload = (await res.json()) as SoftwareAdminOverview;
      setOverview(payload);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      }
    } catch (error) {
      setOverview(null);
      setMessage(error instanceof Error ? error.message : "Could not open software admin.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadOverview(token.trim());
  };

  const logout = () => {
    setToken("");
    setOverview(null);
    setMessage("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  };

  const totals = useMemo(() => {
    const workspaces = overview?.workspaces || [];
    return {
      workspaces: workspaces.length,
      members: workspaces.reduce((sum, workspace) => sum + workspace.members, 0),
      contacts: workspaces.reduce((sum, workspace) => sum + workspace.contacts, 0),
      support: workspaces.reduce((sum, workspace) => sum + workspace.support_grants_active, 0),
    };
  }, [overview]);

  return (
    <main className="min-h-screen bg-base px-4 py-10 text-text">
      <section className="mx-auto max-w-5xl">
        <div className="rounded-lg border border-soft bg-panel p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS operator access</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Software Admin</h1>
              <p className="mt-3 max-w-2xl text-sm text-muted">
                Platform-level view for app operators only. Workspace admins cannot reach this surface and cannot modify software behavior.
              </p>
            </div>
            {overview ? (
              <button type="button" onClick={logout} className="rounded-md border border-soft px-3 py-2 text-sm hover:bg-soft/40">
                Clear Access
              </button>
            ) : null}
          </div>
        </div>

        {message ? <p className="mt-4 rounded-lg border border-soft bg-white p-3 text-sm text-muted">{message}</p> : null}

        {!overview ? (
          <form onSubmit={submit} className="mt-4 rounded-lg border border-soft bg-panel p-5">
            <label className="text-sm font-semibold text-text" htmlFor="software-admin-token">
              Software admin token
            </label>
            <p className="mt-1 text-sm text-muted">
              Set `SOFTWARE_ADMIN_TOKEN` on the backend, then use that value here. This is separate from every workspace login.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                id="software-admin-token"
                type="password"
                value={token}
                onChange={event => setToken(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-soft bg-base px-3 py-2 text-sm focus:border-accent/70 focus:outline-none"
                placeholder="Enter software admin token"
                autoComplete="off"
              />
              <button disabled={loading || !token.trim()} className="rounded-md bg-accent px-5 py-2 text-sm font-semibold disabled:opacity-50">
                {loading ? "Checking..." : "Enter Software Admin"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <section className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-soft bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Workspaces</p>
                <p className="mt-1 text-2xl font-semibold">{totals.workspaces}</p>
              </div>
              <div className="rounded-lg border border-soft bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Members</p>
                <p className="mt-1 text-2xl font-semibold">{totals.members}</p>
              </div>
              <div className="rounded-lg border border-soft bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Contacts</p>
                <p className="mt-1 text-2xl font-semibold">{totals.contacts}</p>
              </div>
              <div className="rounded-lg border border-soft bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Active Support</p>
                <p className="mt-1 text-2xl font-semibold">{totals.support}</p>
              </div>
            </section>

            <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
              <h2 className="text-lg font-semibold">Workspace Overview</h2>
              <p className="mt-1 text-sm text-muted">
                Use this to inspect platform health across workspaces. Workspace-specific changes should still happen inside that workspace.
              </p>
              <div className="mt-4 overflow-x-auto rounded-md border border-soft">
                <table className="min-w-full divide-y divide-soft text-left text-sm">
                  <thead className="bg-base text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3">Workspace</th>
                      <th className="px-3 py-3">Members</th>
                      <th className="px-3 py-3">Contacts</th>
                      <th className="px-3 py-3">Connectors</th>
                      <th className="px-3 py-3">Support</th>
                      <th className="px-3 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-soft bg-white">
                    {overview.workspaces.map(workspace => (
                      <tr key={workspace.workspace_id}>
                        <td className="px-3 py-3 font-semibold">{workspace.workspace_name}</td>
                        <td className="px-3 py-3">{workspace.members}</td>
                        <td className="px-3 py-3">{workspace.contacts}</td>
                        <td className="px-3 py-3">{workspace.connectors_ready}</td>
                        <td className="px-3 py-3">{workspace.support_grants_active}</td>
                        <td className="px-3 py-3">{formatDate(workspace.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
