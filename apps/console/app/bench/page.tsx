import type { ClassScore } from "@scenelock/schema";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/** S12 — SceneBench: gate release scorecards. Catch-rate by risk class, FP rate at τ. */
export default async function SceneBench() {
  const card = await api.getBench();

  if (!card) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[18px] font-medium">SceneBench</h1>
        <div className="panel p-6 text-[var(--color-text-secondary)]">
          No scorecard published yet. Run the corpus:{" "}
          <span className="mono">POST /v1/bench/run</span> (Producer/SRE), or{" "}
          <span className="mono">pnpm --filter @scenelock/saboteur bench</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-medium">SceneBench</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{card.corpus_version}</span>
        <span
          className="ml-auto mono text-[12px] px-2 py-[2px] rounded-[2px] border"
          style={{
            color: card.release_ok ? "var(--color-status-locked)" : "var(--color-status-error)",
            borderColor: "var(--color-line-hair)",
          }}
        >
          {card.release_ok ? "RELEASE OK" : "RELEASE BLOCKED"}
        </span>
      </div>

      <div className="panel">
        <div className="vmb-k px-4 py-2 border-b">
          catch-rate by risk class · τ = {card.tau} · {card.total_cases} cases
        </div>
        <div className="flex flex-col">
          {card.by_risk_class.map((c: ClassScore) => (
            <div key={c.risk_class} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0">
              <span className="mono text-[12px] w-40">{c.risk_class}</span>
              <div className="flex-1 h-2 rounded-[2px] overflow-hidden" style={{ background: "var(--color-bg-raise)" }}>
                <div
                  style={{
                    width: `${c.catch_rate * 100}%`,
                    height: "100%",
                    background: c.pass ? "var(--color-status-locked)" : "var(--color-status-error)",
                  }}
                />
              </div>
              <span className="mono text-[11px] w-28 text-right">
                {(c.catch_rate * 100).toFixed(0)}% / {(c.threshold * 100).toFixed(0)}%
              </span>
              <span className="mono text-[11px] w-16 text-right text-[var(--color-text-secondary)]">
                {c.caught}/{c.cases}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 hair-t flex items-center gap-3 text-[12px] mono">
          <span className="text-[var(--color-text-secondary)]">FP rate at τ</span>
          <span style={{ color: card.fp_rate_at_tau <= card.fp_rate_threshold ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
            {(card.fp_rate_at_tau * 100).toFixed(1)}% / {(card.fp_rate_threshold * 100).toFixed(0)}% ceiling
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="vmb-k px-4 py-2 border-b">cases</div>
        <div className="flex flex-col">
          {card.results.map((r) => (
            <div key={r.case_id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 text-[12px]">
              <span
                className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px] border w-28 text-center"
                style={{
                  color:
                    r.outcome === "caught" || r.outcome === "clean"
                      ? "var(--color-status-locked)"
                      : "var(--color-status-error)",
                  borderColor: "var(--color-line-hair)",
                }}
              >
                {r.outcome}
              </span>
              <span className="mono text-[11px] w-40 text-[var(--color-text-secondary)]">{r.risk_class}</span>
              <span className="mono text-[11px] w-32">{r.case_id}</span>
              <span className="flex-1 text-[var(--color-text-secondary)]">{r.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
