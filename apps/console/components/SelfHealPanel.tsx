"use client";

import { useState } from "react";
import { actions } from "@/lib/api";

/**
 * R7 — run the self-healing loop and show the compliance delta: Trust before →
 * after, which rules the compliant re-render resolved, and which remain (consent
 * rules a render can't fix). The loop visibly earning back trust.
 */
type Diff = Awaited<ReturnType<typeof actions.complianceDiff>>;

const bandTone = (b: string) =>
  b === "green" ? "var(--color-status-locked)" : b === "amber" ? "var(--color-status-held)" : "var(--color-status-error)";

export function SelfHealPanel({ sid }: { sid: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [diff, setDiff] = useState<Diff | null>(null);

  async function run() {
    setState("running");
    try {
      setDiff(await actions.complianceDiff(sid));
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="panel">
      <div className="vmb-k px-4 py-2 border-b flex items-center gap-3">
        <span>Self-heal &amp; compliance diff</span>
        <span className="mono text-[9px] uppercase px-[5px] py-[1px] rounded-[2px] border border-[var(--color-line-hair)] text-[var(--color-text-secondary)]">R7</span>
        <button
          onClick={run}
          disabled={state === "running"}
          className="ml-auto mono text-[11px] px-3 py-[4px] rounded-[3px] border"
          style={{
            borderColor: "var(--color-source-deterministic)",
            color: state === "running" ? "var(--color-text-secondary)" : "var(--color-source-deterministic)",
            cursor: state === "running" ? "wait" : "pointer",
          }}
        >
          {state === "running" ? "healing…" : state === "done" ? "re-run self-heal" : "▶ run self-heal"}
        </button>
      </div>

      {state === "idle" && (
        <div className="px-4 py-4 text-[12px] text-[var(--color-text-secondary)]">
          Run the bounded loop (≤2 regens/finding). A compliant re-render marks each shot, so
          machine-readable-marking and disclosure rules resolve — consent-based rules still need a licence.
        </div>
      )}
      {state === "error" && <div className="px-4 py-4 text-[12px]" style={{ color: "var(--color-status-error)" }}>Self-heal failed — is the API running?</div>}

      {diff && state === "done" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="mono text-[26px]" style={{ color: bandTone(diff.before.trust_band) }}>{diff.before.trust_score}</span>
              <span className="text-[var(--color-text-secondary)]">→</span>
              <span className="mono text-[26px]" style={{ color: bandTone(diff.after.trust_band) }}>{diff.after.trust_score}</span>
            </div>
            <span
              className="mono text-[12px] px-2 py-[2px] rounded-[3px]"
              style={{ color: diff.trust_delta >= 0 ? "var(--color-status-locked)" : "var(--color-status-error)" }}
            >
              {diff.trust_delta >= 0 ? "+" : ""}{diff.trust_delta} trust
            </span>
            <span className="mono text-[11px] text-[var(--color-text-secondary)]">verdict {diff.verdict}{diff.certificate_slug ? ` · ${diff.certificate_slug}` : ""}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="vmb-k mb-1" style={{ color: "var(--color-status-locked)" }}>resolved by the loop ({diff.resolved_rule_ids.length})</div>
              <ul className="flex flex-col gap-1">
                {diff.resolved_rule_ids.length === 0 ? (
                  <li className="text-[11px] text-[var(--color-text-secondary)]">—</li>
                ) : diff.resolved_rule_ids.map((r) => (
                  <li key={r} className="mono text-[11px]" style={{ color: "var(--color-status-locked)" }}>✓ {r}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="vmb-k mb-1" style={{ color: "var(--color-status-error)" }}>still open — needs a human ({diff.remaining_rule_ids.length})</div>
              <ul className="flex flex-col gap-1">
                {diff.remaining_rule_ids.length === 0 ? (
                  <li className="text-[11px] text-[var(--color-text-secondary)]">none</li>
                ) : diff.remaining_rule_ids.map((r) => (
                  <li key={r} className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>✕ {r}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">
            The loop marks shots automatically; consent/licence rules (e.g. a deceased-replica) stay open until cleared —
            use the likeness marketplace below.
          </div>
        </div>
      )}
    </div>
  );
}
