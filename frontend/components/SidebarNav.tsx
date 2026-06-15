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
  { href: "/contacts", label: "Contacts", icon: "CO" },
  { href: "/content", label: "Content", icon: "CT" },
  { href: "/events", label: "Events", icon: "EV" },
];

const intelligenceNav: NavItem[] = [
  { href: "/deals", label: "Deals", icon: "DL" },
  { href: "/organizations", label: "Partners", icon: "PT" },
  { href: "/network/graph", label: "Network Graph", icon: "NG" },
  { href: "/scoreboard", label: "Scoreboard", icon: "SB" },
  { href: "/meetings", label: "Meetings", icon: "MT" },
  { href: "/imports", label: "Imports", icon: "IM" },
  { href: "/funnels", label: "Content Funnels", icon: "CF" },
  { href: "/relateos", label: "RelateOS AI", icon: "AI" },
  { href: "/signals", label: "Signals", icon: "SG" },
];

const systemNav: NavItem[] = [
  { href: "/connections", label: "Connections", icon: "CN" },
  { href: "/settings", label: "Settings", icon: "ST" },
];

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
                  ? "border-accent/80 bg-accent text-text shadow-card"
                  : "border-transparent text-sage-pale/85 hover:border-sage-pale/35 hover:bg-sage/20 hover:text-cream-light"
              }`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold ${
                active ? "border-text/20 bg-honey-pale/70 text-text" : "border-sage-pale/25 bg-sage/15 text-sage-pale"
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

export default function SidebarNav() {
  const pathname = usePathname();
  const mobileItems = [...coreNav, ...intelligenceNav, ...systemNav];

  return (
    <aside className="sticky top-0 z-30 border-b border-text bg-text px-3 py-3 text-cream-light shadow-card md:static md:min-h-screen md:border-b-0 md:border-r md:border-text md:px-4 md:py-6">
      <div className="mb-5 px-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Teifke / Relationships</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-cream-light">Relationship Intelligence</h1>
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" aria-label="Primary navigation">
        {mobileItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                active
                  ? "border-accent/80 bg-accent text-text"
                  : "border-sage-pale/25 text-sage-pale hover:bg-sage/20 hover:text-cream-light"
              }`}
            >
              <span className="text-[10px] font-semibold">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav className="hidden gap-5 md:sticky md:top-5 md:grid" aria-label="Primary navigation">
        <NavSection title="Core Navigation" items={coreNav} pathname={pathname} />
        <NavSection title="Intelligence Layer" items={intelligenceNav} pathname={pathname} />
        <NavSection title="System" items={systemNav} pathname={pathname} />
      </nav>
    </aside>
  );
}
