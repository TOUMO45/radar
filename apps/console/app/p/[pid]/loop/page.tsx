import Link from "next/link";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/** S7 — Loop Monitor (read-only, M3): directives, attempts, incidents. */
export default async function LoopMonitor({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const { directives, attempts, incidents } = await api.getLoop(pid);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← {pid}
        </Link>
        <h1 className="text-[18px] font-medium">Loop Monitor</h1>
      </div>

      {/* incidents */}
      <section className="panel">
        <div className="vmb-k px-4 py-2 border-b">
          incidents · {incidents.filter((i) => i.status === "open").length} open / {incidents.length}
        </div>
        {incidents.length === 0 ? (
          <div className="px-4 py-4 text-[var(--color-text-secondary)]">
            Radar quiet — no incidents.
          </div>
        ) : (
          <div className="flex flex-col">
            {incidents.map((i) => (
              <div key={i.incident_id} className="px-4 py-2 border-b last:border-b-0 flex items-center gap-3">
                <span
                  className="mono text-[11px] px-2 py-[1px] rounded-[2px] border"
                  style={{
                    color: i.status === "open" ? "var(--color-status-error)" : "var(--color-status-locked)",
                    borderColor: "var(--color-line-hair)",
                  }}
                >
                  {i.status}
                </span>
                <span className="mono text-[11px] text-[var(--color-text-secondary)]">{i.incident_id}</span>
                <span className="flex-1 text-[12px]">{i.reason}</span>
                <span className="mono text-[11px] text-[var(--color-text-secondary)]">→ {i.assignee}</span>
                {i.note && (
                  <span className="mono text-[11px] text-[var(--color-status-locked)] max-w-[280px] truncate">
                    {i.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* directives + LoopStepper (C-11) */}
      <section className="panel">
        <div className="vmb-k px-4 py-2 border-b">directives · {directives.length}</div>
        <div className="flex flex-col">
          {directives.map((d) => {
            const steps = attempts
              .filter((a) => a.directive_id === d.directive_id)
              .sort((a, b) => a.attempt_no - b.attempt_no);
            return (
              <div key={d.directive_id} className="px-4 py-3 border-b last:border-b-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 mono text-[11px]">
                  <span>{d.directive_id}</span>
                  <span className="text-[var(--color-text-secondary)]">→ {d.target_finding_id}</span>
                  <span className="text-[var(--color-text-secondary)]">shot {d.shot_id}</span>
                  {d.manual && (
                    <span className="px-2 rounded-[2px]" style={{ background: "var(--color-bg-raise)" }}>
                      manual
                    </span>
                  )}
                  <span className="ml-auto text-[var(--color-text-secondary)]">budget {d.attempt_budget}</span>
                </div>

                {/* stepper: directive → attempt 1 → attempt 2 → outcome */}
                <div className="flex items-center gap-1 mono text-[10px]">
                  <Node label="directive" tone="info" />
                  {steps.map((a) => (
                    <span key={a.attempt_no} className="flex items-center gap-1">
                      <span className="text-[var(--color-text-secondary)]">→</span>
                      <Node
                        label={`try ${a.attempt_no} · ${a.state}`}
                        tone={
                          a.state === "passed"
                            ? "locked"
                            : a.state.startsWith("failed")
                              ? "error"
                              : "held"
                        }
                      />
                    </span>
                  ))}
                  {steps.length === 0 && (
                    <>
                      <span className="text-[var(--color-text-secondary)]">→</span>
                      <Node label="not run" tone="muted" />
                    </>
                  )}
                </div>

                <pre className="mono text-[11px] p-2 rounded-[4px] whitespace-pre-wrap"
                  style={{ background: "var(--color-bg-raise)" }}>
                  {d.prompt_patch}
                </pre>
                <div className="text-[11px] text-[var(--color-text-secondary)]">
                  invariants: {d.invariants.join(" · ")}
                </div>
                <div className="text-[11px] text-[var(--color-text-secondary)]">
                  acceptance: {d.acceptance_criteria.join(" · ")}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* attempts table */}
      <section className="panel">
        <div className="vmb-k px-4 py-2 border-b">attempts · {attempts.length}</div>
        <div className="flex flex-col">
          {attempts.map((a) => (
            <div key={`${a.directive_id}-${a.attempt_no}`} className="px-4 py-2 border-b last:border-b-0 flex items-center gap-4 mono text-[11px]">
              <span>{a.directive_id} · #{a.attempt_no}</span>
              <span
                style={{
                  color:
                    a.state === "passed"
                      ? "var(--color-status-locked)"
                      : a.state.startsWith("failed")
                        ? "var(--color-status-error)"
                        : "var(--color-status-held)",
                }}
              >
                {a.state}
              </span>
              <span className="text-[var(--color-text-secondary)]">Veo {a.cost.veo_seconds}s</span>
              <span className="text-[var(--color-text-secondary)]">
                {(a.cost.gemini_tokens / 1000).toFixed(1)}k tok
              </span>
              <span className="text-[var(--color-text-secondary)]">${a.cost.usd.toFixed(2)}</span>
              <span className="text-[var(--color-text-secondary)]">
                {a.latency_ms != null ? `${(a.latency_ms / 1000).toFixed(1)}s` : "—"}
              </span>
              {a.manual && <span>manual</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const TONE: Record<string, string> = {
  info: "var(--color-source-deterministic)",
  locked: "var(--color-status-locked)",
  held: "var(--color-status-held)",
  error: "var(--color-status-error)",
  muted: "var(--color-text-secondary)",
};

function Node({ label, tone }: { label: string; tone: keyof typeof TONE }) {
  return (
    <span
      className="px-2 py-[2px] rounded-[2px] border"
      style={{ color: TONE[tone], borderColor: "var(--color-line-hair)" }}
    >
      {label}
    </span>
  );
}
