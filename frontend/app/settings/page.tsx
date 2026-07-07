"use client";

import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { resolveApiUrl } from "@/components/api";

type UserProfile = {
  id: string;
  workspace_id?: string | null;
  name: string;
  email: string;
  company_name?: string | null;
  role_title?: string | null;
  relationship_focus?: string | null;
  primary_goal?: string | null;
  timezone?: string | null;
  wants_calendar_connection?: boolean;
  wants_contact_import?: boolean;
  onboarding_complete?: boolean;
  workspace_role?: string;
  permissions?: string[];
};

type StyleProfile = {
  owner_user_id: string;
  tone: string;
  length: string;
  energy: string;
  emoji_usage: string;
};

type TwoFactorSetup = {
  secret: string;
  otpauth_url: string;
};

type TeamMember = {
  id: string;
  user_id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  accepted_at?: string | null;
  created_at: string;
};

type TeamInvite = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

type TeamOverview = {
  members: TeamMember[];
  invites: TeamInvite[];
  current_role: string;
  permissions: string[];
};

const focusOptions = ["Clients", "Investors", "Partners", "Events", "Community", "Content audience"];
const goalOptions = ["Prioritize follow-up", "Invite people to events", "Send better content", "Track deals", "Build partner network", "Clean up contacts"];
const teamRoles = ["admin", "member", "viewer"];

const defaultProfile: UserProfile = {
  id: "",
  name: "",
  email: "",
  company_name: "",
  role_title: "",
  relationship_focus: focusOptions[0],
  primary_goal: goalOptions[0],
  timezone: "America/Chicago",
  wants_calendar_connection: true,
  wants_contact_import: true,
};

const defaultStyle: StyleProfile = {
  owner_user_id: "",
  tone: "casual",
  length: "short",
  energy: "medium",
  emoji_usage: "low",
};

export default function SettingsPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [style, setStyle] = useState<StyleProfile>(defaultStyle);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorQrUrl, setTwoFactorQrUrl] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [teamBusy, setTeamBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preferences, setPreferences] = useState({
    dailyFocusDigest: true,
    autoCreateContacts: true,
    requireReviewBeforeBulkSend: true,
    allowEventInviteSuggestions: true,
  });

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setStatus("");
      try {
        const profileRes = await fetch(`${API_URL}/auth/me`, { cache: "no-store" });
        if (!profileRes.ok) throw new Error("Could not load your profile.");
        const user = (await profileRes.json()) as UserProfile;
        const normalizedUser = {
          ...defaultProfile,
          ...user,
          company_name: user.company_name || "",
          role_title: user.role_title || "",
          relationship_focus: user.relationship_focus || defaultProfile.relationship_focus,
          primary_goal: user.primary_goal || defaultProfile.primary_goal,
          timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || defaultProfile.timezone,
        };
        setProfile(normalizedUser);

        const styleRes = await fetch(`${API_URL}/preferences/style/${user.id}`, { cache: "no-store" });
        if (styleRes.ok) {
          setStyle(await styleRes.json());
        } else {
          setStyle({ ...defaultStyle, owner_user_id: user.id });
        }

        const twoFactorRes = await fetch(`${API_URL}/auth/2fa/status`, { cache: "no-store" });
        if (twoFactorRes.ok) {
          const payload = (await twoFactorRes.json()) as { enabled: boolean };
          setTwoFactorEnabled(payload.enabled);
        }

        if ((user.permissions || []).includes("*") || (user.permissions || []).includes("members:read")) {
          const teamRes = await fetch(`${API_URL}/team`, { cache: "no-store" });
          if (teamRes.ok) setTeam(await teamRes.json());
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load settings.");
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [API_URL]);

  const can = (permission: string) => {
    const permissions = profile.permissions || team?.permissions || [];
    return permissions.includes("*") || permissions.includes(permission);
  };

  const loadTeam = async () => {
    const res = await fetch(`${API_URL}/team`, { cache: "no-store" });
    if (!res.ok) return;
    setTeam(await res.json());
  };

  useEffect(() => {
    let cancelled = false;
    const buildQrCode = async () => {
      if (!twoFactorSetup?.otpauth_url) {
        setTwoFactorQrUrl("");
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(twoFactorSetup.otpauth_url, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 6,
          color: {
            dark: "#1C3A2A",
            light: "#FFFFFF",
          },
        });
        if (!cancelled) setTwoFactorQrUrl(dataUrl);
      } catch {
        if (!cancelled) setTwoFactorQrUrl("");
      }
    };

    void buildQrCode();
    return () => {
      cancelled = true;
    };
  }, [twoFactorSetup]);

  const updateProfile = <Key extends keyof UserProfile>(key: Key, value: UserProfile[Key]) => {
    setProfile(current => ({ ...current, [key]: value }));
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          company_name: profile.company_name || "Not set",
          role_title: profile.role_title || "Not set",
          relationship_focus: profile.relationship_focus || focusOptions[0],
          primary_goal: profile.primary_goal || goalOptions[0],
          timezone: profile.timezone || "America/Chicago",
          wants_calendar_connection: Boolean(profile.wants_calendar_connection),
          wants_contact_import: Boolean(profile.wants_contact_import),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not save profile.");
      }
      setProfile(await res.json());
      setStatus("Profile settings saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const inviteTeamMember = async () => {
    setTeamBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/team/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not send invite.");
      }
      setInviteEmail("");
      setInviteRole("member");
      await loadTeam();
      setStatus("Team invite sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send invite.");
    } finally {
      setTeamBusy(false);
    }
  };

  const updateTeamRole = async (membershipId: string, role: string) => {
    setTeamBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/team/members/${membershipId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not update role.");
      }
      setTeam(await res.json());
      setStatus("Team role updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update role.");
    } finally {
      setTeamBusy(false);
    }
  };

  const removeTeamMember = async (membershipId: string) => {
    setTeamBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/team/members/${membershipId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not remove member.");
      }
      await loadTeam();
      setStatus("Team member removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove member.");
    } finally {
      setTeamBusy(false);
    }
  };

  const revokeTeamInvite = async (inviteId: string) => {
    setTeamBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/team/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not revoke invite.");
      }
      await loadTeam();
      setStatus("Invite revoked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not revoke invite.");
    } finally {
      setTeamBusy(false);
    }
  };

  const saveStyle = async () => {
    if (!profile.id) return;
    setSavingStyle(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/preferences/style/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone: style.tone,
          length: style.length,
          energy: style.energy,
          emoji_usage: style.emoji_usage,
        }),
      });
      if (!res.ok) throw new Error("Could not save AI style settings.");
      setStyle(await res.json());
      setStatus("AI message style saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save AI style settings.");
    } finally {
      setSavingStyle(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setTwoFactorBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/auth/2fa/setup`, { method: "POST" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not start two-factor setup.");
      }
      setTwoFactorSetup(await res.json());
      setTwoFactorCode("");
      setStatus("Add this account to your authenticator app, then enter the six-digit code to finish.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start two-factor setup.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const enableTwoFactor = async () => {
    setTwoFactorBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/auth/2fa/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not enable two-factor authentication.");
      }
      const payload = (await res.json()) as { enabled: boolean };
      setTwoFactorEnabled(payload.enabled);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setStatus("Two-factor authentication is now enabled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not enable two-factor authentication.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    setTwoFactorBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not disable two-factor authentication.");
      }
      const payload = (await res.json()) as { enabled: boolean };
      setTwoFactorEnabled(payload.enabled);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setStatus("Two-factor authentication is now disabled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not disable two-factor authentication.");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const readyItems = [
    Boolean(profile.company_name),
    Boolean(profile.role_title),
    Boolean(profile.relationship_focus),
    Boolean(profile.primary_goal),
    Boolean(profile.timezone),
    twoFactorEnabled,
  ].filter(Boolean).length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="rounded-lg border border-soft bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text sm:text-4xl">Settings</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted">Manage workspace identity, AI defaults, workflow behavior, and setup readiness.</p>
          </div>
          <div className="rounded-lg border border-soft bg-base px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Setup complete</p>
            <p className="mt-1 text-2xl font-semibold text-text">{readyItems}/6</p>
          </div>
        </div>
      </header>

      {status ? (
        <p className="mt-4 rounded-lg border border-soft bg-panel px-4 py-3 text-sm text-text">{status}</p>
      ) : null}

      {can("members:read") ? (
        <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text">Team Access</h2>
              <p className="mt-1 text-sm text-muted">Invite teammates and control what they can do inside this workspace.</p>
            </div>
            <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">
              {profile.workspace_role || team?.current_role || "member"}
            </span>
          </div>

          {can("members:invite") ? (
            <div className="mt-4 grid gap-3 rounded-lg border border-soft bg-base p-4 md:grid-cols-[1fr_180px_auto]">
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
          ) : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-soft">
            <div className="grid grid-cols-[1.4fr_120px_120px_auto] gap-3 border-b border-soft bg-base px-4 py-2 text-xs uppercase tracking-wide text-muted">
              <span>Member</span>
              <span>Role</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {(team?.members || []).map(member => (
              <div key={member.id} className="grid grid-cols-[1.4fr_120px_120px_auto] items-center gap-3 border-b border-soft bg-white px-4 py-3 text-sm last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text">{member.name}</p>
                  <p className="truncate text-xs text-muted">{member.email}</p>
                </div>
                {can("members:manage") && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    onChange={event => updateTeamRole(member.id, event.target.value)}
                    disabled={teamBusy}
                    className="rounded-md border border-soft bg-base px-2 py-1.5 text-xs text-text"
                  >
                    {teamRoles.map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                ) : (
                  <span className="text-sm text-text">{member.role}</span>
                )}
                <span className="rounded-full border border-soft bg-sage-pale px-2 py-1 text-xs text-forest">{member.status}</span>
                <div className="text-right">
                  {can("members:manage") && member.role !== "owner" && member.user_id !== profile.id ? (
                    <button
                      type="button"
                      onClick={() => removeTeamMember(member.id)}
                      disabled={teamBusy}
                      className="rounded-md border border-soft bg-base px-3 py-1.5 text-xs font-medium text-text hover:bg-soft/30 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </div>
              </div>
            ))}
            {team && team.members.length === 0 ? (
              <p className="bg-white px-4 py-4 text-sm text-muted">No team members loaded yet.</p>
            ) : null}
          </div>

          {team?.invites?.length ? (
            <div className="mt-4 rounded-lg border border-soft bg-base p-4">
              <p className="text-sm font-semibold text-text">Pending invites</p>
              <div className="mt-3 grid gap-2">
                {team.invites.map(invite => (
                  <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-soft bg-white px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold text-text">{invite.invited_email}</span>
                      <span className="ml-2 text-xs text-muted">{invite.role}</span>
                    </span>
                    {can("members:manage") ? (
                      <button
                        type="button"
                        onClick={() => revokeTeamInvite(invite.id)}
                        disabled={teamBusy}
                        className="rounded-md border border-soft bg-base px-3 py-1.5 text-xs font-medium text-text hover:bg-soft/30 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-lg border border-soft bg-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text">Workspace Profile</h2>
              <p className="mt-1 text-sm text-muted">This context drives dashboards, AI language, event workflows, and relationship prioritization.</p>
            </div>
            <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">
              {loading ? "Loading" : "Active"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-text">
              Name
              <input
                value={profile.name}
                onChange={event => updateProfile("name", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Email
              <input
                value={profile.email}
                disabled
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-muted outline-none"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Company or team
              <input
                value={profile.company_name || ""}
                onChange={event => updateProfile("company_name", event.target.value)}
                placeholder="Teifke Real Estate"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Your role
              <input
                value={profile.role_title || ""}
                onChange={event => updateProfile("role_title", event.target.value)}
                placeholder="Founder, operator, investor relations"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Relationship focus
              <select
                value={profile.relationship_focus || focusOptions[0]}
                onChange={event => updateProfile("relationship_focus", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                {focusOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Primary goal
              <select
                value={profile.primary_goal || goalOptions[0]}
                onChange={event => updateProfile("primary_goal", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                {goalOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Timezone
              <input
                value={profile.timezone || ""}
                onChange={event => updateProfile("timezone", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-md border border-soft bg-base p-3 text-sm text-text">
              <input
                type="checkbox"
                checked={Boolean(profile.wants_calendar_connection)}
                onChange={event => updateProfile("wants_calendar_connection", event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">Prioritize calendar connection</span>
                <span className="text-muted">Use events and meetings as relationship signals.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-soft bg-base p-3 text-sm text-text">
              <input
                type="checkbox"
                checked={Boolean(profile.wants_contact_import)}
                onChange={event => updateProfile("wants_contact_import", event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">Prioritize contact import</span>
                <span className="text-muted">Make onboarding start with a clean people list.</span>
              </span>
            </label>
          </div>

          <button
            onClick={saveProfile}
            disabled={savingProfile || loading}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text transition hover:brightness-105 disabled:opacity-50"
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </article>

        <aside className="grid gap-4">
          <article className="rounded-lg border border-soft bg-panel p-5">
            <h2 className="text-lg font-semibold text-text">Setup Checklist</h2>
            <div className="mt-4 grid gap-2">
              {[
                ["Profile", Boolean(profile.company_name && profile.role_title)],
                ["Relationship goal", Boolean(profile.relationship_focus && profile.primary_goal)],
                ["Timezone", Boolean(profile.timezone)],
                ["Connectors", Boolean(profile.wants_calendar_connection || profile.wants_contact_import)],
                ["AI style", Boolean(style.tone && style.length)],
                ["Account security", twoFactorEnabled],
              ].map(([label, complete]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-md border border-soft bg-base px-3 py-2 text-sm">
                  <span className="text-text">{String(label)}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${complete ? "bg-sage-pale text-forest" : "bg-honey-light text-text"}`}>
                    {complete ? "Ready" : "Needs input"}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-soft bg-panel p-5">
            <h2 className="text-lg font-semibold text-text">Integration Hub</h2>
            <p className="mt-1 text-sm text-muted">Connector credentials and OAuth accounts live in Connections.</p>
            <div className="mt-4 grid gap-2">
              <Link href="/connections" className="rounded-md bg-accent px-4 py-2 text-center text-sm font-semibold text-text hover:brightness-105">
                Open Connections
              </Link>
              <Link href="/imports" className="rounded-md border border-soft bg-base px-4 py-2 text-center text-sm font-medium text-text hover:bg-soft/30">
                Import Contacts
              </Link>
            </div>
          </article>

          <article className="rounded-lg border border-soft bg-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">Account Security</h2>
                <p className="mt-1 text-sm text-muted">Require an authenticator app code after password sign-in.</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${twoFactorEnabled ? "border-sage bg-sage-pale text-forest" : "border-honey bg-honey-light text-text"}`}>
                {twoFactorEnabled ? "2FA on" : "2FA off"}
              </span>
            </div>

            {twoFactorSetup ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 rounded-md border border-soft bg-base p-3 sm:grid-cols-[160px_1fr]">
                  <div className="flex h-40 w-40 items-center justify-center rounded-md border border-soft bg-white p-2">
                    {twoFactorQrUrl ? (
                      <Image
                        src={twoFactorQrUrl}
                        alt="Authenticator app QR code"
                        width={144}
                        height={144}
                        unoptimized
                        className="h-full w-full"
                      />
                    ) : (
                      <span className="text-center text-xs text-muted">Generating QR code...</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">Scan with your authenticator app</p>
                    <p className="mt-1 text-sm text-muted">Open Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app and scan this code.</p>
                    <p className="mt-3 text-xs uppercase tracking-wide text-muted">Manual setup key</p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold text-text">{twoFactorSetup.secret}</p>
                  </div>
                </div>
                <div className="rounded-md border border-soft bg-base p-3">
                  <p className="text-sm font-semibold text-text">Finish setup</p>
                  <p className="mt-1 text-xs text-muted">After scanning, enter the six-digit code from the app to activate two-factor authentication.</p>
                </div>
                <label className="grid gap-1 text-sm font-medium text-text">
                  Verification code
                  <input
                    value={twoFactorCode}
                    onChange={event => setTwoFactorCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={enableTwoFactor}
                    disabled={twoFactorBusy || twoFactorCode.trim().length < 6}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-105 disabled:opacity-50"
                  >
                    {twoFactorBusy ? "Checking..." : "Enable 2FA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorSetup(null);
                      setTwoFactorCode("");
                    }}
                    className="rounded-md border border-soft bg-base px-4 py-2 text-sm font-medium text-text hover:bg-soft/30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : twoFactorEnabled ? (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-text">
                  Authenticator code
                  <input
                    value={twoFactorCode}
                    onChange={event => setTwoFactorCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter code to disable"
                    className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
                  />
                </label>
                <button
                  type="button"
                  onClick={disableTwoFactor}
                  disabled={twoFactorBusy || twoFactorCode.trim().length < 6}
                  className="rounded-md border border-soft bg-base px-4 py-2 text-sm font-semibold text-text hover:bg-soft/30 disabled:opacity-50"
                >
                  {twoFactorBusy ? "Checking..." : "Disable 2FA"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startTwoFactorSetup}
                disabled={twoFactorBusy}
                className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-105 disabled:opacity-50"
              >
                {twoFactorBusy ? "Starting..." : "Set Up 2FA"}
              </button>
            )}
          </article>
        </aside>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-soft bg-panel p-5">
          <h2 className="text-lg font-semibold text-text">AI Message Defaults</h2>
          <p className="mt-1 text-sm text-muted">These defaults shape future suggested messages and follow-up drafts.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-text">
              Tone
              <select
                value={style.tone}
                onChange={event => setStyle(current => ({ ...current, tone: event.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="direct">Direct</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Length
              <select
                value={style.length}
                onChange={event => setStyle(current => ({ ...current, length: event.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Energy
              <select
                value={style.energy}
                onChange={event => setStyle(current => ({ ...current, energy: event.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Emoji usage
              <select
                value={style.emoji_usage}
                onChange={event => setStyle(current => ({ ...current, emoji_usage: event.target.value }))}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
              </select>
            </label>
          </div>

          <button
            onClick={saveStyle}
            disabled={savingStyle || loading || !profile.id}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text transition hover:brightness-105 disabled:opacity-50"
          >
            {savingStyle ? "Saving..." : "Save AI Defaults"}
          </button>
        </article>

        <article className="rounded-lg border border-soft bg-panel p-5">
          <h2 className="text-lg font-semibold text-text">Workflow Preferences</h2>
          <p className="mt-1 text-sm text-muted">Use these to clarify how the workspace should behave as more automations go live.</p>

          <div className="mt-5 grid gap-3">
            {[
              ["dailyFocusDigest", "Daily focus digest", "Show the best people to talk to when the day starts."],
              ["autoCreateContacts", "Auto-create contacts from meetings", "Let meeting imports add people when an attendee is missing."],
              ["requireReviewBeforeBulkSend", "Review before bulk send", "Keep content sends and invites human-approved."],
              ["allowEventInviteSuggestions", "Event invite suggestions", "Allow events to recommend contacts by tags, roles, and activity."],
            ].map(([key, label, help]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded-md border border-soft bg-base p-3 text-sm">
                <span>
                  <span className="block font-semibold text-text">{label}</span>
                  <span className="text-muted">{help}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(preferences[key as keyof typeof preferences])}
                  onChange={event => setPreferences(current => ({ ...current, [key]: event.target.checked }))}
                  className="mt-1"
                />
              </label>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-4 rounded-lg border border-soft bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">Workspace Safety</h2>
            <p className="mt-1 text-sm text-muted">Keep high-risk actions visible while the app grows into multi-client use.</p>
          </div>
          <span className="rounded-full border border-soft bg-base px-3 py-1 text-xs uppercase tracking-wide text-muted">Recommended</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Bulk send approval", "Require review before content or event invites go out."],
            ["Data cleanup", "Keep cleanup actions admin-only and preserve login users by default."],
            ["Connector ownership", "OAuth and API keys stay scoped to this workspace."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-md border border-soft bg-base p-4">
              <p className="font-semibold text-text">{title}</p>
              <p className="mt-1 text-sm text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
