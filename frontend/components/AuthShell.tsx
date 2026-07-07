"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import SidebarNav from "@/components/SidebarNav";
import { resolveApiUrl } from "@/components/api";
import { AUTH_CHANGED_EVENT, TOKEN_KEY, clearAuthToken } from "@/components/authClient";

type User = {
  id: string;
  email: string;
  name: string;
  onboarding_complete: boolean;
  workspace_role?: string;
  permissions?: string[];
};

const shouldAttachAuth = (input: RequestInfo | URL, apiUrl: string) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return raw.startsWith(apiUrl);
};

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const API_URL = useMemo(resolveApiUrl, []);
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const isLoginPage = pathname === "/login";
  const isOnboardingPage = pathname === "/onboarding";
  const isResetPasswordPage = pathname === "/reset-password";
  const isAcceptInvitePage = pathname === "/accept-invite";
  const isPublicAuthPage = isLoginPage || isResetPasswordPage || isAcceptInvitePage;

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (!token || !shouldAttachAuth(input, API_URL)) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${token}`);
      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [API_URL]);

  useEffect(() => {
    const checkSession = async () => {
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setUser(null);
        setChecking(false);
        if (!isPublicAuthPage) router.replace("/login");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Session expired");
        }
        const nextUser = (await res.json()) as User;
        setUser(nextUser);
        if (isLoginPage) {
          router.replace(nextUser.onboarding_complete ? "/dashboard" : "/onboarding");
        } else if (!nextUser.onboarding_complete && !isOnboardingPage) {
          router.replace("/onboarding");
        } else if (nextUser.onboarding_complete && isOnboardingPage) {
          router.replace("/dashboard");
        }
      } catch {
        clearAuthToken();
        setUser(null);
        if (!isPublicAuthPage) router.replace("/login");
      } finally {
        setChecking(false);
      }
    };

    checkSession();
    window.addEventListener(AUTH_CHANGED_EVENT, checkSession);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, checkSession);
  }, [API_URL, isLoginPage, isOnboardingPage, isPublicAuthPage, router]);

  if (isPublicAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-lg border border-soft bg-white p-5 text-sm text-muted shadow-card">
          Checking secure session...
        </div>
      </main>
    );
  }

  if (isOnboardingPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <SidebarNav user={user} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
