import type { CostCaps, CostSpend } from "@scenelock/schema";

/**
 * Cost governor (spec E.12). Enforcement point: before any Veo call. 80% → warn,
 * 100% → auto kill-switch (loop paused, verdict HELD, findings intact).
 */
export type BudgetLevel = "green" | "warn" | "kill";

export interface AttemptCost {
  veo_seconds: number;
  gemini_tokens: number;
  usd: number;
}

export interface BudgetStatus {
  level: BudgetLevel;
  /** worst ratio across the three caps, 0..>1 */
  ratio: number;
  detail: {
    veo_seconds: { spent: number; cap: number };
    gemini_tokens: { spent: number; cap: number };
    loop_attempts: { spent: number; cap: number };
    usd: { spent: number; cap: number };
  };
}

const WARN = 0.8;

export function evaluateBudget(
  spend: CostSpend,
  caps: CostCaps,
  pending: AttemptCost & { attempts?: number } = { veo_seconds: 0, gemini_tokens: 0, usd: 0 },
): BudgetStatus {
  const usdCap = caps.usd_cap ?? Infinity;
  const ratios = [
    ratio(spend.veo_seconds + pending.veo_seconds, caps.veo_seconds_cap),
    ratio(spend.gemini_tokens + pending.gemini_tokens, caps.gemini_token_cap),
    ratio(spend.loop_attempts + (pending.attempts ?? 0), caps.loop_attempts_cap),
    ratio(spend.usd + pending.usd, usdCap),
  ];
  const r = Math.max(...ratios);
  const level: BudgetLevel = r >= 1 ? "kill" : r >= WARN ? "warn" : "green";
  return {
    level,
    ratio: r,
    detail: {
      veo_seconds: { spent: spend.veo_seconds, cap: caps.veo_seconds_cap },
      gemini_tokens: { spent: spend.gemini_tokens, cap: caps.gemini_token_cap },
      loop_attempts: { spent: spend.loop_attempts, cap: caps.loop_attempts_cap },
      usd: { spent: spend.usd, cap: Number.isFinite(usdCap) ? usdCap : 0 },
    },
  };
}

function ratio(spent: number, cap: number): number {
  if (!Number.isFinite(cap)) return 0; // no cap configured
  if (cap <= 0) return Number.POSITIVE_INFINITY; // a zero cap allows nothing
  return spent / cap;
}

export function addCost(a: CostSpend, c: AttemptCost, attempts = 0): CostSpend {
  return {
    veo_seconds: a.veo_seconds + c.veo_seconds,
    gemini_tokens: a.gemini_tokens + c.gemini_tokens,
    loop_attempts: a.loop_attempts + attempts,
    usd: a.usd + c.usd,
  };
}
