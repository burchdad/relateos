"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

const tabs: Array<{ href: Route; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/content", label: "Content" },
  { href: "/events", label: "Events" },
];

export default function AppTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition ${
              active
                ? "border-accent bg-accent/20 text-accent"
                : "border-soft bg-panel/40 text-muted hover:border-accent/40 hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
