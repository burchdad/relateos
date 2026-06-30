"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveApiUrl } from "@/components/api";
import { TOKEN_KEY } from "@/components/authClient";

type UserProfile = {
  name: string;
  email: string;
  company_name?: string | null;
  role_title?: string | null;
  relationship_focus?: string | null;
  primary_goal?: string | null;
  timezone?: string | null;
  wants_calendar_connection?: boolean;
  wants_contact_import?: boolean;
};

const focusOptions = [
  "Clients",
  "Investors",
  "Partners",
  "Events",
  "Community",
  "Content audience",
];

const goalOptions = [
  "Prioritize follow-up",
  "Invite people to events",
  "Send better content",
  "Track deals",
  "Build partner network",
  "Clean up contacts",
];

export default function OnboardingPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    company_name: "",
    role_title: "",
    relationship_focus: focusOptions[0],
    primary_goal: goalOptions[0],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
    wants_calendar_connection: true,
    wants_contact_import: true,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = window.localStorage.getItem(TOKEN_KEY);
        const res = await fetch(`${API_URL}/auth/me`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const user = (await res.json()) as UserProfile;
        setProfile((current) => ({
          ...current,
          ...user,
          company_name: user.company_name || "",
          role_title: user.role_title || "",
          relationship_focus: user.relationship_focus || current.relationship_focus,
          primary_goal: user.primary_goal || current.primary_goal,
          timezone: user.timezone || current.timezone,
        }));
      } catch {
        setError("Could not load your profile yet.");
      }
    };
    loadProfile();
  }, [API_URL]);

  const updateField = <Key extends keyof UserProfile>(key: Key, value: UserProfile[Key]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not save profile.");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    setError("");
    setSubmitting(true);
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: profile.name || "Relationship User",
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
        throw new Error("Could not skip setup.");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip setup.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-lg border border-soft bg-white p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Set up your relationship profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Give Teifke enough context to prioritize people, content, and events around how you work.
        </p>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-text">
              Name
              <input
                required
                value={profile.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Company or team
              <input
                required
                value={profile.company_name || ""}
                onChange={(event) => updateField("company_name", event.target.value)}
                placeholder="Teifke Real Estate"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Your role
              <input
                required
                value={profile.role_title || ""}
                onChange={(event) => updateField("role_title", event.target.value)}
                placeholder="Founder, investor relations, sales lead"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Timezone
              <input
                required
                value={profile.timezone || ""}
                onChange={(event) => updateField("timezone", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Relationship focus
              <select
                required
                value={profile.relationship_focus || focusOptions[0]}
                onChange={(event) => updateField("relationship_focus", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                {focusOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-text">
              Primary goal
              <select
                required
                value={profile.primary_goal || goalOptions[0]}
                onChange={(event) => updateField("primary_goal", event.target.value)}
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                {goalOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 rounded-md border border-soft bg-base p-4 md:grid-cols-2">
            <label className="flex items-start gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={Boolean(profile.wants_calendar_connection)}
                onChange={(event) => updateField("wants_calendar_connection", event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">Connect calendar next</span>
                <span className="text-muted">Use meetings and events as relationship signals.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={Boolean(profile.wants_contact_import)}
                onChange={(event) => updateField("wants_contact_import", event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">Import contacts next</span>
                <span className="text-muted">Bring in the people Teifke should prioritize.</span>
              </span>
            </label>
          </div>

          {error ? <p className="rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Finish Setup"}
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={submitting}
              className="text-sm font-medium text-muted hover:text-text"
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
