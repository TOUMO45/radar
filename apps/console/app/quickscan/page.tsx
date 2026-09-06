import { QuickScanPanel } from "@/components/QuickScanPanel";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Quick Scan — a standalone, best-effort preliminary check (additive
 * capability, not part of the graded production pipeline). No production_id,
 * no auth beyond the route's own rate limit — a deliberately public entry
 * point. See README.md's "Quick Scan" section for exactly what it does and
 * does not verify.
 */
export default function QuickScanPage() {
  return (
    <div className="flex flex-col gap-5 max-w-[880px]">
      <PageHeader
        eyebrow="Standalone"
        title="Quick Scan"
        sub="Paste a script excerpt or drop a frame — Radar name-matches trademarks, lyrics and public figures against its watchlist and reads any C2PA manifest. Best-effort, no production required, not legal advice."
      />
      <QuickScanPanel />
    </div>
  );
}
