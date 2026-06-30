"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { resolveApiUrl } from "@/components/api";

function ResetPasswordForm() {
  const API_URL = useMemo(resolveApiUrl, []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not reset password.");
      }
      const payload = (await res.json()) as { message: string };
      setNotice(payload.message);
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-soft bg-white p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Create a new password</h1>
        <p className="mt-2 text-sm text-muted">
          Choose a new password for your relationship intelligence workspace.
        </p>

        {!token ? (
          <div className="mt-5 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-sm text-red-700">
            This reset link is missing a token. Request a new password reset from the login page.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-3">
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password, minimum 8 characters"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <input
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />

            {error ? <p className="rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {notice ? <p className="rounded-md border border-sage/40 bg-sage-pale px-3 py-2 text-sm text-text">{notice}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        <Link href="/login" className="mt-4 block text-sm font-medium text-muted hover:text-text">
          Back to sign in
        </Link>
      </div>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <section className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="rounded-lg border border-soft bg-white p-5 text-sm text-muted shadow-card">
            Loading reset form...
          </div>
        </section>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
