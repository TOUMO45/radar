/**
 * C-12 CostMeter — spend vs cap (Veo seconds, tokens, attempts, USD).
 * Amber at 80%, red + kill state at 100% (E.12). Every number binds to a field.
 */
type Detail = Record<
  "veo_seconds" | "gemini_tokens" | "loop_attempts" | "usd",
  { spent: number; cap: number }
>;

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

export function CostMeter({
  detail,
  level,
  killSwitch,
}: {
  detail: Detail;
  level: "green" | "warn" | "kill";
  killSwitch: boolean;
}) {
  const rows: Array<[string, { spent: number; cap: number }, (n: number) => string]> = [
    ["Veo seconds", detail.veo_seconds, (n) => `${n.toFixed(0)}s`],
    ["Gemini tokens", detail.gemini_tokens, fmt],
    ["loop attempts", detail.loop_attempts, (n) => `${n}`],
    ["USD", detail.usd, (n) => `$${n.toFixed(2)}`],
  ];
  return (
    <div className="panel p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="vmb-k">cost governor</span>
        <span
          className="mono text-[11px] px-2 py-[1px] rounded-[2px] border"
          style={{
            color:
              level === "kill"
                ? "var(--color-status-error)"
                : level === "warn"
                  ? "var(--color-status-held)"
                  : "var(--color-status-locked)",
            borderColor: "var(--color-line-hair)",
          }}
        >
          {killSwitch ? "KILL SWITCH ENGAGED" : level}
        </span>
      </div>
      {rows.map(([label, d, f]) => {
        const ratio = d.cap > 0 ? d.spent / d.cap : 0;
        const pct = Math.min(100, ratio * 100);
        const color =
          ratio >= 1
            ? "var(--color-status-error)"
            : ratio >= 0.8
              ? "var(--color-status-held)"
              : "var(--color-source-deterministic)";
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="vmb-k w-28">{label}</span>
            <div className="flex-1 h-2 rounded-[2px] overflow-hidden" style={{ background: "var(--color-bg-raise)" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color }} />
            </div>
            <span className="mono text-[11px] w-28 text-right text-[var(--color-text-secondary)]">
              {f(d.spent)} / {f(d.cap)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
