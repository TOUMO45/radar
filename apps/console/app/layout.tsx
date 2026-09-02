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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="flex items-center gap-3 border-b px-4 h-11 bg-[var(--color-bg-panel)]">
          <Link href="/" className="mono text-[15px] tracking-tight">
            RA<span className="text-[var(--color-source-deterministic)]">DAR</span>
          </Link>
          <span className="text-[var(--color-text-secondary)] text-[11px] uppercase tracking-wider">
            Review Console
          </span>
          <Link href="/bench" className="mono text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            SceneBench
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <RoleSwitcher />
            <span className="mono text-[11px] text-[var(--color-status-held)] border px-2 py-[2px] rounded-[2px]">
              DRY_RUN
            </span>
          </div>
        </header>
        <main className="p-4 max-w-[1400px] mx-auto">{children}</main>
      </body>
    </html>
  );
}
