"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Grouped left-rail navigation for a production (S1→S14). Turns the console from
 * a page of ad-hoc links into a real app: functions grouped, current screen lit.
 */
type Item = { href: string; label: string; badge?: string };
type Group = { title: string; items: Item[] };

export function SideNav({ pid }: { pid: string }) {
  const pathname = usePathname() ?? "";
  const p = (s: string) => `/p/${pid}${s}`;

  const groups: Group[] = [
    { title: "Production", items: [{ href: p(""), label: "Overview" }] },
    {
      title: "Review",
      items: [
        { href: p("/scenes/sc_12"), label: "War Room" },
        { href: p("/findings"), label: "Finding Inbox" },
        { href: p("/world"), label: "World State" },
        { href: p("/loop"), label: "Loop Monitor" },
      ],
    },
    {
      title: "Compliance & Delivery",
      items: [
        { href: p("/compliance"), label: "Compliance", badge: "2026" },
        { href: p("/delivery"), label: "Delivery QC", badge: "R4" },
        { href: p("/music"), label: "Music & Cues", badge: "R6" },
        { href: p("/consent"), label: "Consent Registry" },
      ],
    },
    {
      title: "Certification",
      items: [
        { href: p("/underwriting"), label: "E&O Pack", badge: "R1" },
        { href: p("/certificates"), label: "Certificates" },
      ],
    },
  ];

  const isActive = (href: string) => {
    // exact for overview; prefix for the rest
    if (href === p("")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="w-[204px] flex-none flex flex-col gap-5 pr-3 sticky top-[68px] self-start" aria-label="Production navigation">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-[3px]">
          <div className="h-eyebrow px-2 mb-1 flex items-center gap-[6px]">
            <span className="w-[3px] h-[3px] rounded-full bg-[var(--color-accent)]" />
            {g.title}
          </div>
          {g.items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-2 px-3 py-[7px] rounded-[5px] text-[13px] transition-all duration-150"
                style={{
                  background: active ? "var(--color-bg-raise)" : "transparent",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  boxShadow: active
                    ? "inset 2px 0 0 var(--color-accent), 0 0 20px -10px var(--color-accent)"
                    : "inset 2px 0 0 transparent",
                }}
              >
                <span className="flex-1">{it.label}</span>
                {it.badge && (
                  <span className="chip chip-soft !text-[9px] !px-[5px] !py-[1px]">{it.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
