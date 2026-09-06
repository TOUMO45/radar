"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Grouped left-rail navigation for a production (S1→S14). Turns the console from
 * a page of ad-hoc links into a real app: functions grouped, current screen lit.
 */
type Item = { href: string; label: string; badge?: string };
type Group = { title: string; items: Item[]; tone: string };

export function SideNav({ pid }: { pid: string }) {
  const pathname = usePathname() ?? "";
  const p = (s: string) => `/p/${pid}${s}`;

  const groups: Group[] = [
    { title: "Production", tone: "var(--color-accent)", items: [{ href: p(""), label: "Overview" }] },
    {
      title: "Review",
      tone: "var(--color-source-model)",
      items: [
        { href: p("/scenes/sc_12"), label: "War Room" },
        { href: p("/findings"), label: "Finding Inbox" },
        { href: p("/world"), label: "World State" },
        { href: p("/loop"), label: "Loop Monitor" },
      ],
    },
    {
      title: "Compliance & Delivery",
      tone: "var(--color-source-hybrid)",
      items: [
        { href: p("/compliance"), label: "Compliance", badge: "2026" },
        { href: p("/delivery"), label: "Delivery QC", badge: "R4" },
        { href: p("/music"), label: "Music & Cues", badge: "R6" },
        { href: p("/consent"), label: "Consent Registry" },
      ],
    },
    {
      title: "Certification",
      tone: "var(--color-status-certified)",
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
    <nav
      aria-label="Production navigation"
      className="
        w-full lg:w-[204px] lg:flex-none lg:self-start lg:sticky lg:top-[68px]
        flex lg:flex-col gap-1 lg:gap-5 lg:pr-3
        overflow-x-auto lg:overflow-visible
        -mx-1 px-1 lg:mx-0
        border-b lg:border-b-0 border-[var(--color-line-hair)] pb-2 lg:pb-0
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
      "
    >
      {groups.map((g) => (
        <div key={g.title} className="flex lg:flex-col gap-1 lg:gap-[3px] shrink-0">
          <div className="h-eyebrow px-2 mb-1 hidden lg:flex items-center gap-[6px]">
            <span
              className="w-[4px] h-[4px] rounded-full"
              style={{ background: g.tone, boxShadow: `0 0 6px ${g.tone}` }}
            />
            {g.title}
          </div>
          {g.items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-2 px-3 py-[7px] rounded-[6px] text-[13px] whitespace-nowrap transition-all duration-150 hover:text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-bg-raise)_60%,transparent)]"
                style={{
                  background: active ? "var(--color-bg-raise)" : "transparent",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  boxShadow: active
                    ? `inset 2px 0 0 ${g.tone}, 0 0 20px -10px ${g.tone}`
                    : "inset 2px 0 0 transparent",
                }}
              >
                <span className="flex-1">{it.label}</span>
                {it.badge && (
                  <span className="chip chip-soft !text-[9px] !px-[5px] !py-[1px] hidden lg:inline-flex">{it.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
