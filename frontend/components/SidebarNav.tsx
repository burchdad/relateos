"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { clearAuthToken } from "@/components/authClient";

export type NavItem = {
  href: Route;
  label: string;
  icon: string;
};

export const coreNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "DB" },
  { href: "/contacts", label: "Contacts", icon: "CO" },
  { href: "/content", label: "Content", icon: "CT" },
  { href: "/events", label: "Events", icon: "EV" },
];

export const intelligenceNav: NavItem[] = [
  { href: "/deals", label: "Deals", icon: "DL" },
  { href: "/organizations", label: "Partners", icon: "PT" },
  { href: "/network/graph", label: "Network Graph", icon: "NG" },
  { href: "/scoreboard", label: "Scoreboard", icon: "SB" },
  { href: "/tasks", label: "Tasks", icon: "TK" },
  { href: "/meetings", label: "Meetings", icon: "MT" },
  { href: "/imports", label: "Imports", icon: "IM" },
  { href: "/funnels", label: "Content Funnels", icon: "CF" },
  { href: "/relateos", label: "RelateOS AI", icon: "AI" },
  { href: "/signals", label: "Signals", icon: "SG" },
];

export const systemNav: NavItem[] = [
  { href: "/workspace-admin", label: "Admin", icon: "WA" },
  { href: "/connections", label: "Connections", icon: "CN" },
  { href: "/settings", label: "Settings", icon: "ST" },
];

export function canSeeWorkspaceAdmin(user?: { workspace_role?: string; permissions?: string[] } | null) {
  const permissions = new Set(user?.permissions || []);
  return user?.workspace_role === "owner" || user?.workspace_role === "admin" || permissions.has("*") || permissions.has("workspace:manage");
}

export function canSeeConnections(user?: { permissions?: string[] } | null) {
  const permissions = new Set(user?.permissions || []);
  return permissions.has("*") || permissions.has("connections:manage");
}

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <section>
      <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.16em] text-sage-pale/80">{title}</p>
      <div className="grid gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition ${
                active
                  ? "border-accent/70 bg-accent/90 text-text shadow-[0_6px_16px_rgba(227,184,100,0.18)]"
                  : "border-transparent text-sage-pale/85 hover:border-sage-pale/35 hover:bg-sage/20 hover:text-cream-light"
              }`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold ${
                active ? "border-text/20 bg-honey-pale/65 text-text" : "border-sage-pale/25 bg-sage/15 text-sage-pale"
              }`}>
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

type SidebarNavProps = {
  user?: {
    email: string;
    name: string;
    workspace_role?: string;
    permissions?: string[];
  } | null;
};

export default function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname();
  const visibleSystemNav = systemNav.filter((item) => {
    if (item.href === "/workspace-admin") return canSeeWorkspaceAdmin(user);
    if (item.href === "/connections") return canSeeConnections(user);
    return true;
  });
  return (
    <aside className="min-h-screen border-r border-text bg-text px-4 py-6 text-cream-light shadow-card">
      <div className="mb-5 px-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-cream-light">Relationship Intelligence</h1>
      </div>

      <nav className="sticky top-5 grid gap-5" aria-label="Primary navigation">
        <NavSection title="Core Navigation" items={coreNav} pathname={pathname} />
        <NavSection title="Intelligence Layer" items={intelligenceNav} pathname={pathname} />
        <NavSection title="System" items={visibleSystemNav} pathname={pathname} />
        <section className="rounded-lg border border-sage-pale/20 bg-sage/10 p-3">
          <p className="truncate text-xs font-semibold text-cream-light">{user?.name || "Signed in"}</p>
          <p className="mt-1 truncate text-[11px] text-sage-pale/75">{user?.email}</p>
          <p className="mt-2 inline-flex rounded-full border border-sage-pale/25 px-2 py-1 text-[10px] uppercase tracking-wide text-sage-pale/80">
            {user?.workspace_role || "member"}
          </p>
          <button
            type="button"
            onClick={clearAuthToken}
            className="mt-3 w-full rounded-md border border-sage-pale/30 px-3 py-2 text-xs font-semibold text-sage-pale hover:bg-sage/20 hover:text-cream-light"
          >
            Log Out
          </button>
        </section>
      </nav>
    </aside>
  );
}
