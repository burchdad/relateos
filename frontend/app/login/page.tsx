"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveApiUrl } from "@/components/api";
import { saveAuthToken } from "@/components/authClient";

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export default function LoginPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password }
        ),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not sign in.");
      }

      const payload = (await res.json()) as AuthPayload;
      saveAuthToken(payload.token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-soft bg-white p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-2 text-2xl font-semibold text-text">
          {mode === "login" ? "Sign in to RelateOS" : "Create your RelateOS login"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Secure access for your relationship intelligence workspace.
        </p>

        <form onSubmit={submit} className="mt-5 grid gap-3">
          {mode === "register" ? (
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
          ) : null}
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
          />
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "register" ? "Password, minimum 8 characters" : "Password"}
            className="rounded-md border border-soft bg-base px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/60"
          />

          {error ? <p className="rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "register" : "login"));
            setError("");
          }}
          className="mt-4 text-sm font-medium text-muted hover:text-text"
        >
          {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </section>
  );
}
