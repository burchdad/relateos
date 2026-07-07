"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { resolveApiUrl } from "@/components/api";
import { saveAuthToken, TOKEN_KEY } from "@/components/authClient";

type InvitePreview = {
  email: string;
  role: string;
  workspace_name: string;
  status: string;
  requires_account: boolean;
};

type AuthPayload = {
  token?: string | null;
  user?: {
    onboarding_complete: boolean;
  } | null;
  requires_2fa?: boolean;
  two_factor_challenge_token?: string | null;
  requires_email_verification?: boolean;
  email_verification_challenge_token?: string | null;
  message?: string | null;
};

function AcceptInviteContent() {
  const API_URL = useMemo(resolveApiUrl, []);
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading invite...");
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(window.localStorage.getItem(TOKEN_KEY)));
    const loadInvite = async () => {
      if (!token) {
        setStatus("Invite token is missing.");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/team/invites/preview?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(payload?.detail || "Invite link is invalid.");
        }
        const payload = (await res.json()) as InvitePreview;
        setPreview(payload);
        setMode(payload.requires_account ? "register" : "login");
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Invite link is invalid.");
      }
    };
    void loadInvite();
  }, [API_URL, token]);

  const acceptInvite = async () => {
    const res = await fetch(`${API_URL}/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(payload?.detail || "Could not accept invite.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preview) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? {
                name: name.trim(),
                email: preview.email,
                password,
                invitation_token: token,
                ...(challenge ? {
                  email_verification_code: code.trim(),
                  email_verification_challenge_token: challenge,
                } : {}),
              }
            : {
                email: preview.email,
                password,
                ...(twoFactorChallenge ? {
                  two_factor_code: twoFactorCode.trim(),
                  two_factor_challenge_token: twoFactorChallenge,
                } : {}),
              }
        ),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not continue.");
      }
      const payload = (await res.json()) as AuthPayload;
      if (payload.requires_email_verification) {
        setChallenge(payload.email_verification_challenge_token || null);
        setCode("");
        setStatus(payload.message || "Check your email for a verification code.");
        return;
      }
      if (payload.requires_2fa) {
        setTwoFactorChallenge(payload.two_factor_challenge_token || null);
        setTwoFactorCode("");
        setStatus(payload.message || "Enter your authenticator app code.");
        return;
      }
      if (!payload.token) throw new Error("Could not complete invite.");
      saveAuthToken(payload.token);
      if (mode === "login") await acceptInvite();
      router.replace(payload.user?.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  };

  const acceptWithCurrentSession = async () => {
    setBusy(true);
    setStatus("");
    try {
      await acceptInvite();
      router.replace("/dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-lg border border-soft bg-white p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Accept team invite</h1>
        {preview ? (
          <p className="mt-2 text-sm text-muted">
            Join <span className="font-semibold text-text">{preview.workspace_name}</span> as <span className="font-semibold text-text">{preview.role}</span>.
          </p>
        ) : null}

        {status ? <p className="mt-4 rounded-md border border-soft bg-base px-3 py-2 text-sm text-text">{status}</p> : null}

        {preview && hasSession ? (
          <button
            type="button"
            onClick={acceptWithCurrentSession}
            disabled={busy}
            className="mt-5 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Accepting..." : "Accept with current session"}
          </button>
        ) : null}

        {preview ? (
          <form onSubmit={submit} className="mt-5 grid gap-3">
            {mode === "register" ? (
              <input
                required
                value={name}
                onChange={event => setName(event.target.value)}
                disabled={Boolean(challenge)}
                placeholder="Your name"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60 disabled:text-muted"
              />
            ) : null}
            <input
              value={preview.email}
              disabled
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-muted outline-none"
            />
            <input
              required
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={Boolean(challenge)}
              placeholder={mode === "register" ? "Create password, minimum 8 characters" : "Password"}
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60 disabled:text-muted"
            />
            {challenge ? (
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={event => setCode(event.target.value)}
                placeholder="Email verification code"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
              />
            ) : null}
            {twoFactorChallenge ? (
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={event => setTwoFactorCode(event.target.value)}
                placeholder="Authenticator code"
                className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
              />
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Working..." : challenge ? "Verify and Join" : twoFactorChallenge ? "Verify and Join" : mode === "register" ? "Create Account and Join" : "Sign In and Join"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted">Loading invite...</main>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
