"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { coreNav, intelligenceNav, systemNav, type NavItem } from "@/components/SidebarNav";

type MobileNavProps = {
  user: {
    email: string;
    name: string;
    workspace_role?: string;
    permissions?: string[];
  };
  onLogout: () => void;
};

const openAssistant = () => {
  window.dispatchEvent(new Event("relateos-open-assistant"));
};

function canSeeConnections(user: MobileNavProps["user"]) {
  const permissions = new Set(user.permissions || []);
  return permissions.has("*") || permissions.has("connections:manage");
}

function MobileNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition ${
        active
          ? "border-accent/70 bg-accent/90 text-text shadow-[0_6px_16px_rgba(227,184,100,0.18)]"
          : "border-sage-pale/20 bg-sage/10 text-sage-pale hover:border-sage-pale/35 hover:bg-sage/20 hover:text-cream-light"
      }`}
    >
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-semibold ${
          active ? "border-text/20 bg-honey-pale/65 text-text" : "border-sage-pale/25 bg-sage/15 text-sage-pale"
        }`}
      >
        {item.icon}
      </span>
      <span className="font-semibold">{item.label}</span>
    </Link>
  );
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <section>
      <p className="mb-2 px-1 text-[11px] uppercase tracking-[0.16em] text-sage-pale/80">{title}</p>
      <div className="grid gap-2">
        {items.map(item => (
          <MobileNavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

export default function MobileNav({ user, onLogout }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const visibleSystemNav = canSeeConnections(user) ? systemNav : systemNav.filter(item => item.href === "/settings");

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-text/15 bg-text px-4 py-3 text-cream-light shadow-card md:hidden">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-accent">Teifke / Relationships</p>
          <h1 className="truncate text-base font-semibold text-cream-light">Relationship Intelligence</h1>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            className="absolute inset-0 bg-text/55"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,360px)] flex-col overflow-y-auto border-r border-text bg-text px-4 py-5 text-cream-light shadow-card">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-cream-light">Menu</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-sage-pale/25 px-3 py-1.5 text-sm font-semibold text-sage-pale"
              >
                Close
              </button>
            </div>

            <nav className="grid gap-5" aria-label="Mobile primary navigation">
              <NavSection title="Core Navigation" items={coreNav} pathname={pathname} onNavigate={() => setOpen(false)} />
              <NavSection title="Intelligence Layer" items={intelligenceNav} pathname={pathname} onNavigate={() => setOpen(false)} />
              <NavSection title="System" items={visibleSystemNav} pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>

            <section className="mt-6 rounded-lg border border-sage-pale/20 bg-sage/10 p-3">
              <p className="truncate text-xs font-semibold text-cream-light">{user.name || "Signed in"}</p>
              <p className="mt-1 truncate text-[11px] text-sage-pale/75">{user.email}</p>
              <p className="mt-2 inline-flex rounded-full border border-sage-pale/25 px-2 py-1 text-[10px] uppercase tracking-wide text-sage-pale/80">
                {user.workspace_role || "member"}
              </p>
              <button
                type="button"
                onClick={onLogout}
                className="mt-3 w-full rounded-md border border-sage-pale/30 px-3 py-2 text-xs font-semibold text-sage-pale hover:bg-sage/20 hover:text-cream-light"
              >
                Log Out
              </button>
            </section>
          </aside>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-text/15 bg-text px-2 pb-3 pt-2 text-cream-light shadow-card md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg px-2 py-2 text-xs font-semibold text-sage-pale">
          Menu
        </button>
        <button type="button" onClick={() => navigateTo("/dashboard")} className="rounded-lg px-2 py-2 text-xs font-semibold text-sage-pale">
          Dashboard
        </button>
        <button type="button" onClick={() => navigateTo("/contacts")} className="rounded-lg px-2 py-2 text-xs font-semibold text-sage-pale">
          Contacts
        </button>
        <button type="button" onClick={openAssistant} className="rounded-lg bg-accent px-2 py-2 text-xs font-bold text-text">
          Teifke AI
        </button>
      </nav>
    </>
  );
}
