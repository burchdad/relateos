"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

type NavItem = {
  href: Route;
  label: string;
  icon: string;
};

const coreNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "DB" },
  { href: "/relationships", label: "Relationships", icon: "RL" },
  { href: "/content", label: "Content", icon: "CT" },
  { href: "/events", label: "Events", icon: "EV" },
];

const intelligenceNav: NavItem[] = [
  { href: "/relateos", label: "RelateOS", icon: "AI" },
  { href: "/signals", label: "Signals", icon: "SG" },
];

const systemNav: NavItem[] = [
  { href: "/connections", label: "Connections", icon: "CN" },
  { href: "/settings", label: "Settings", icon: "ST" },
];

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <section>
      <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.16em] text-muted">{title}</p>
      <div className="grid gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition ${
                active
                  ? "border-accent/60 bg-accent/15 text-text"
                  : "border-transparent text-muted hover:border-soft hover:bg-soft/40 hover:text-text"
              }`}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-soft bg-panel text-[10px] font-semibold text-muted">
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

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-soft bg-panel/85 px-3 py-4 md:min-h-screen md:border-b-0 md:border-r md:px-4 md:py-6">
      <div className="mb-5 px-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-text">Operating Console</h1>
      </div>

      <nav className="grid gap-5 md:sticky md:top-5">
        <NavSection title="Core Navigation" items={coreNav} pathname={pathname} />
        <NavSection title="Intelligence Layer" items={intelligenceNav} pathname={pathname} />
        <NavSection title="System" items={systemNav} pathname={pathname} />
      </nav>
    </aside>
  );
}
