"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top-bar section nav. Mirrors the SideNav's active treatment so "where am I"
 *  reads the same in both places. */
const NAV = [
  { href: "/", label: "Productions" },
  { href: "/quickscan", label: "Quick Scan" },
  { href: "/assistant", label: "Assistant" },
  { href: "/bench", label: "SceneBench" },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/p/") : pathname.startsWith(href);

  return (
    <nav className="order-3 sm:order-none w-full sm:w-auto sm:ml-2 flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className="px-3 py-[6px] rounded-[6px] text-[13px] whitespace-nowrap transition-colors"
            style={{
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: active ? "var(--color-bg-raise)" : "transparent",
              boxShadow: active ? "inset 0 -2px 0 var(--color-accent)" : "none",
            }}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
