import type { Metadata } from "next";
import Link from "next/link";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { TopNav } from "@/components/TopNav";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* drifting colour + fine film-grain flicker, purely decorative — see globals.css */}
        <div className="aurora-layer" aria-hidden>
          <span /><span /><span /><span />
        </div>
        <div className="grain-layer" aria-hidden />
        <header className="topbar">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 sm:gap-4 px-3 sm:px-5 py-2 sm:py-0 sm:h-[52px] max-w-[1440px] mx-auto">
            <Link href="/" className="flex items-center gap-2 group shrink-0" aria-label="Radar home">
              <span className="rec-dot" aria-hidden />
              <span className="mono text-[16px] tracking-tight font-medium wordmark-gradient">
                RADAR
              </span>
            </Link>
            <span className="h-eyebrow hidden md:block shrink-0">Review Console</span>

            <TopNav />

            <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0 order-1 sm:order-none">
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
