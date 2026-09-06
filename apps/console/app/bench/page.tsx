import type { ClassScore } from "@scenelock/schema";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/** S12 — SceneBench: gate release scorecards. Catch-rate by risk class, FP rate at τ. */
export default async function SceneBench() {
  const card = await api.getBench();

  if (!card) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Quality" title="SceneBench" sub="Gate release scorecard — catch-rate per risk class and false-positive rate at the decision threshold." />
        <div className="section-card p-6 text-[var(--color-text-secondary)]">
          No scorecard published yet. Run the corpus:{" "}
          <span className="mono">POST /v1/bench/run</span> (Producer/SRE), or{" "}
          <span className="mono">pnpm --filter @scenelock/saboteur bench</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Quality"
        title="SceneBench"
        sub={`Adversarial corpus ${card.corpus_version} — does each gate still catch what it's meant to, without crying wolf on clean footage?`}
        status={card.release_ok ? "release ok" : "release blocked"}
        statusTone={card.release_ok ? "locked" : "error"}
      />

      <div className="section-card rise">
        <div className="section-head" style={{ ["--head-color" as string]: "var(--color-source-deterministic)" }}>
          catch-rate by risk class · τ = {card.tau} · {card.total_cases} cases
        </div>
        <div className="flex flex-col">
          {card.by_risk_class.map((c: ClassScore) => (
            <div key={c.risk_class} className="flex items-center gap-3 px-4 py-[10px] border-b last:border-b-0">
              <span className="mono text-[12px] w-40 shrink-0">{c.risk_class}</span>
              <div className="bar flex-1">
                <i
                  style={{
                    width: `${c.catch_rate * 100}%`,
                    ["--bar-color" as string]: c.pass ? "var(--color-status-locked)" : "var(--color-status-error)",
                  }}
                />
              </div>
              <span className="mono text-[11px] w-28 text-right tabular-nums">
                {(c.catch_rate * 100).toFixed(0)}% / {(c.threshold * 100).toFixed(0)}%
              </span>
              <span className="mono text-[11px] w-16 text-right text-[var(--color-text-secondary)] tabular-nums">
                {c.caught}/{c.cases}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-[10px] hair-t flex items-center gap-3 text-[12px] mono">
          <span className="text-[var(--color-text-secondary)]">FP rate at τ</span>
          <span style={{ color: card.fp_rate_at_tau <= card.fp_rate_threshold ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
            {(card.fp_rate_at_tau * 100).toFixed(1)}% / {(card.fp_rate_threshold * 100).toFixed(0)}% ceiling
          </span>
        </div>
      </div>

      <div className="section-card rise">
        <div className="section-head" style={{ ["--head-color" as string]: "var(--color-source-model)" }}>cases</div>
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
