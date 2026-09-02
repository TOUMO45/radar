import type { SceneVerdict } from "@scenelock/schema";
import { REASON_COPY, VerdictChip } from "./badges";

/**
 * C-01 VerdictBanner + C-02 VerdictMathBar.
 * "Show the math" (UX principle 2): the lock rule is visible at all times.
 * Every number binds to a real field on the verdict_inputs snapshot (E.4).
 */
export function VerdictMathBar({ v }: { v: SceneVerdict }) {
  const i = v.inputs;
  const held = v.verdict !== "LOCKED";
  return (
    <div className="panel overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-2 border-b"
        style={{
          background: "var(--color-bg-raise)",
          borderLeft: `3px solid ${held ? "var(--color-status-held)" : "var(--color-status-locked)"}`,
        }}
      >
        <VerdictChip verdict={v.verdict} />
        <span className="text-[var(--color-text-secondary)]">
          {REASON_COPY[v.reason]}
        </span>
        <span className="ml-auto mono text-[11px] text-[var(--color-text-secondary)]">
          {i.snapshot_ref}
        </span>
      </div>

      <div className="flex flex-wrap">
        <Seg
          k="open blocking ≥ τ"
          v={String(i.blocking_open)}
          alert={i.blocking_open > 0}
        />
        <Seg
          k="gate coverage"
          v={i.gate_coverage.label}
          alert={i.gate_coverage.completed !== i.gate_coverage.required}
        />
        <Seg
          k="C2PA coverage"
          v={i.c2pa_coverage.label}
          alert={i.c2pa_coverage.valid !== i.c2pa_coverage.shots}
        />
        <Seg k="τ (production)" v={i.tau.toFixed(2)} />
        <Seg
          k="shots gates-complete"
          v={`${i.shots_gates_complete}/${i.shots_total}`}
          alert={i.shots_gates_complete !== i.shots_total}
        />
        <Seg k="config" v={i.config_version} />
        <Seg
          k="kill switch"
          v={i.kill_switch ? "ENGAGED" : "clear"}
          alert={i.kill_switch}
        />
      </div>
    </div>
  );
}

function Seg({ k, v, alert }: { k: string; v: string; alert?: boolean }) {
  return (
    <div className="vmb-seg">
      <span className="vmb-k">{k}</span>
      <span
        className="vmb-v mono"
        style={{ color: alert ? "var(--color-status-error)" : "var(--color-text-primary)" }}
      >
        {v}
      </span>
    </div>
  );
}
