import { QuickScanPanel } from "@/components/QuickScanPanel";

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
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-medium">Quick Scan</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">
          preliminary check · no production required
        </span>
      </div>
      <QuickScanPanel />
    </div>
  );
}
