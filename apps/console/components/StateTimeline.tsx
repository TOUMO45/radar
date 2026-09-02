import type { StateEvent } from "@scenelock/schema";

/** C-10 StateTimeline — entity state-machine track from state_events; planned vs observed vs canonical. */
export function StateTimeline({ events }: { events: StateEvent[] }) {
  if (events.length === 0)
    return <div className="text-[11px] text-[var(--color-text-secondary)]">no transitions recorded</div>;

  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto py-1">
      {sorted.map((e, i) => {
        const tone = e.canonical
          ? "var(--color-status-locked)"
          : e.actor === "planner"
            ? "var(--color-status-info)"
            : "var(--color-status-held)";
        return (
          <span key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-[var(--color-text-secondary)] mono text-[10px]">→</span>}
            <span
              className="mono text-[10px] px-2 py-[3px] rounded-[2px] border"
              style={{ color: tone, borderColor: "var(--color-line-hair)" }}
              title={`${e.actor} · ${e.ts}${e.canonical ? " · canonical" : " · candidate"}`}
            >
              {e.to}
              <span className="text-[var(--color-text-secondary)]"> · {e.actor}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Tiny deterministic drift sparkline — cosine-vs-anchor over recent observations. */
export function DriftSparkline({ seed, threshold = 0.82 }: { seed: string; threshold?: number }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pts = Array.from({ length: 12 }, (_, i) => {
    const n = ((h >> (i % 24)) & 0xff) / 0xff;
    return 0.74 + n * 0.24; // 0.74..0.98
  });
  const W = 120;
  const H = 28;
  const path = pts
    .map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - 0.7) / 0.3) * H}`)
    .join(" ");
  const yThresh = H - ((threshold - 0.7) / 0.3) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[120px] h-[28px]">
      <line x1="0" y1={yThresh} x2={W} y2={yThresh} stroke="var(--color-status-held)" strokeDasharray="2 2" strokeWidth="1" />
      <polyline points={path} fill="none" stroke="var(--color-source-hybrid)" strokeWidth="1.5" />
    </svg>
  );
}
