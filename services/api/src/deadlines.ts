import { RULES } from "@scenelock/rulepack";

/**
 * Live regulatory deadline clock (Feature 5).
 *
 * The dates are the exact `effective` values already cited in
 * packages/rulepack/src/rules.ts — not re-guessed here. `days_remaining` is
 * computed server-side from the real current time.
 *
 * Framing note, stated honestly: every synthetic-media obligation the
 * rulepack cites is ALREADY in force as of the RADAR build date (the EU AI
 * Act Art. 50 transparency obligations took effect 2026-08-02). So
 * `days_remaining` is zero or negative for every entry — this is an
 * *exposure clock* ("this obligation has been enforceable for N days"), not a
 * countdown to a future grace-period end. `days_remaining` stays a signed
 * number so a genuinely future obligation added later would show a positive
 * countdown with no code change.
 */

const DAY_MS = 86_400_000;

export interface Deadline {
  citation: string;
  title: string;
  jurisdiction: string | null;
  platform: string | null;
  effective: string;
  days_remaining: number;
  status: "in_force" | "upcoming";
  phrase: string;
  penalty: string | null;
  rule_ids: string[];
}

export interface DeadlinesResponse {
  generated_at: string;
  now: string;
  note: string;
  deadlines: Deadline[];
}

export function computeDeadlines(now: string): DeadlinesResponse {
  const nowMs = Date.parse(now);

  const groups = new Map<string, Deadline>();
  for (const r of RULES) {
    const key = `${r.citation}::${r.effective}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rule_ids.push(r.id);
      if (!existing.penalty && r.penalty) existing.penalty = r.penalty;
      continue;
    }
    const effectiveMs = Date.parse(r.effective);
    const days_remaining = Math.ceil((effectiveMs - nowMs) / DAY_MS);
    const status: Deadline["status"] = days_remaining > 0 ? "upcoming" : "in_force";
    const elapsed = -days_remaining;
    const phrase =
      status === "upcoming"
        ? `${days_remaining} day${days_remaining === 1 ? "" : "s"} until enforceable`
        : elapsed === 0
          ? "enforceable as of today"
          : `enforceable for ${elapsed} day${elapsed === 1 ? "" : "s"}`;
    groups.set(key, {
      citation: r.citation,
      title: r.title,
      jurisdiction: r.scope.jurisdiction ?? null,
      platform: r.scope.platform ?? null,
      effective: r.effective,
      days_remaining,
      status,
      phrase,
      penalty: r.penalty ?? null,
      rule_ids: [r.id],
    });
  }

  const deadlines = [...groups.values()].sort((a, b) =>
    a.effective === b.effective ? a.citation.localeCompare(b.citation) : a.effective.localeCompare(b.effective),
  );

  return {
    generated_at: now,
    now,
    note:
      "Dates are the cited `effective` values from packages/rulepack. Every synthetic-media obligation " +
      "RADAR tracks is already in force as of this build - `days_remaining` is an exposure clock " +
      "(negative = days a production has been non-compliant if undisclosed), not a countdown to a future date.",
    deadlines,
  };
}
