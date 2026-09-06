"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client";

/**
 * Ask the production — a thin UI over `POST /v1/assistant/ask` (FEATURE 6).
 * Reuses Quick Scan's exact shape: `panel-hero` input, busy/error state, a
 * direct `fetch` through the `/api/*` BFF, `ApiError`. The answer is grounded
 * server-side in the production's real findings; the assistant holds zero tools
 * and cannot change a verdict.
 */

interface Grounding {
  verdict: string;
  verdict_reason: string;
  trust_score: number | null;
  trust_band: string | null;
  open_blocking_count: number;
  open_blocking_finding_ids: string[];
  all_findings: { finding_id: string }[];
}
interface AssistantAnswer {
  answer: string;
  grounded: boolean;
  model: string | null;
  grounding_check?: boolean;
  note?: string;
  grounding?: Grounding;
}

const PRODUCTIONS = ["sc_12", "p_dry"] as const;

export function AssistantPanel() {
  const [pid, setPid] = useState<string>("sc_12");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantAnswer | null>(null);

  async function submit() {
    if (!question.trim() || busy) return;
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/assistant/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ production_id: pid, question }),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText);
      setResult(body as AssistantAnswer);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const groundingCount = result?.grounding?.all_findings.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel-hero p-5 flex flex-col gap-4 rise">
        <div className="flex items-center gap-3">
          <span className="h-eyebrow flex-1">ask a question</span>
          <label className="mono text-[11px] text-[var(--color-text-faint)] flex items-center gap-2">
            production
            <select
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              className="mono text-[11px] bg-[var(--color-bg-raise)] border border-[var(--color-line-soft)] rounded-[4px] px-2 py-1 text-[var(--color-text-primary)]"
            >
              {PRODUCTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 bg-[var(--color-bg-sink)] border rounded-[6px] px-3 py-3 transition-shadow focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_1px_var(--color-accent),0_0_28px_-8px_var(--color-accent)]">
          <span className="mono text-[15px] text-[var(--color-source-hybrid)] select-none">&gt;</span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            maxLength={2000}
            placeholder="Why is this scene held?"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </div>

        <button
          onClick={submit}
          disabled={!question.trim() || busy}
          className="mono text-[13px] px-4 py-2 rounded-[6px] border self-start transition-all disabled:opacity-40 enabled:hover:shadow-[0_0_24px_-6px_var(--color-accent)]"
          style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}
        >
          {busy ? "⟳ asking…" : "▶ ask"}
        </button>

        {err && (
          <div className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>
            {err}
          </div>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-4 rise">
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-solid" style={{ color: "var(--color-source-model)" }}>
              grounding · {groundingCount} finding{groundingCount === 1 ? "" : "s"}
            </span>
            <span className="chip chip-solid" style={{ color: "var(--color-source-hybrid)" }}>
              tools · none granted
            </span>
            <span className="chip chip-solid" style={{ color: "var(--color-status-held)" }}>
              read-only · cannot sign
            </span>
          </div>

          <div className="section-card p-5">
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap">{result.answer}</div>
            <div className="mono text-[10px] text-[var(--color-text-faint)] mt-4 pt-3 hair-t flex flex-wrap gap-x-4 gap-y-1">
              <span>model · {result.model ?? "grounded facts (model unavailable)"}</span>
              {result.grounding && (
                <span>
                  verdict · {result.grounding.verdict} · trust{" "}
                  {result.grounding.trust_score ?? "n/a"}/{result.grounding.trust_band ?? "n/a"} ·{" "}
                  {result.grounding.open_blocking_count} blocking
                </span>
              )}
              {result.grounding_check && <span>grounding check · passed</span>}
            </div>
            {result.note && (
              <div className="mono text-[10px] text-[var(--color-text-secondary)] mt-2">{result.note}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
