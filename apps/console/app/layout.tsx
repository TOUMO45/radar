import type { Metadata } from "next";
import Link from "next/link";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import "./globals.css";

/*
 * Fonts: the Control Room type is IBM Plex Sans / Mono (D13). We reference them
 * via the CSS stacks in globals.css (--font-sans / --font-mono) with full
 * fallbacks rather than next/font/google, so builds don't depend on network
 * access to fonts.gstatic.com. Self-hosting the Plex woff2 files is an M0 polish
 * item.
 */

export const metadata: Metadata = {
  title: "Radar — Review Console",
  description: "Closed-loop QA radar for AI-generated film content",
};

const NAV = [
  { href: "/", label: "Productions" },
  { href: "/quickscan", label: "Quick Scan" },
  { href: "/bench", label: "SceneBench" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="flex items-center gap-4 px-5 h-[52px] max-w-[1440px] mx-auto">
            <Link href="/" className="flex items-center gap-2 group" aria-label="Radar home">
              <span
                className="chip chip-dot text-[var(--color-status-locked)] border-transparent bg-transparent px-0"
                aria-hidden
              />
              <span className="mono text-[16px] tracking-tight font-medium">
                RA<span className="text-[var(--color-accent)]">DAR</span>
              </span>
            </Link>
            <span className="h-eyebrow hidden sm:block">Review Console</span>

            <nav className="ml-4 flex items-center gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-[6px] rounded-[5px] text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-raise)] transition-colors"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <span className="mono text-[11px] text-[var(--color-text-faint)] hidden md:flex items-center gap-1">
                <kbd className="border rounded-[3px] px-[5px] py-[1px] bg-[var(--color-bg-raise)]">⌘K</kbd>
                to jump
              </span>
              <RoleSwitcher />
              <span className="chip chip-dot text-[var(--color-status-held)]">DRY_RUN</span>
            </div>
          </div>
        </header>
        <main className="px-5 py-6 max-w-[1440px] mx-auto">{children}</main>
      </body>
    </html>
  );
}
