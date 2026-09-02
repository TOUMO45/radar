import type { ComplianceProfile, ShotProvenance } from "@scenelock/schema";
import { RULES, type ComplianceRule, type EvalContext } from "./rules.js";

export * from "./rules.js";

export interface RuleViolation {
  rule: ComplianceRule;
  shot_id: string;
  /** which target put this rule in force (territory or platform id). */
  in_force_by: string;
}

/** Is a rule in force given the production's distribution profile? */
export function ruleInForce(rule: ComplianceRule, profile: ComplianceProfile): string | null {
  const j = rule.scope.jurisdiction;
  if (j) {
    if (j === "GLOBAL") return "GLOBAL";
    if (profile.territories.includes(j)) return j;
    return null;
  }
  const p = rule.scope.platform;
  if (p && profile.platforms.includes(p)) return p;
  return null;
}

export interface EvaluateDeps {
  hasActiveConsent: (subject: string | null) => boolean;
  now: string;
}

/**
 * Evaluate one shot's provenance against every rule in force for the profile.
 * Deterministic: same inputs → same violations, in rule-declaration order.
 */
export function evaluateShot(
  prov: ShotProvenance,
  profile: ComplianceProfile,
  deps: EvaluateDeps,
): RuleViolation[] {
  const ctx: EvalContext = {
    prov,
    hasActiveConsent: deps.hasActiveConsent,
    now: deps.now,
  };
  const out: RuleViolation[] = [];
  for (const rule of RULES) {
    const inForce = ruleInForce(rule, profile);
    if (!inForce) continue;
    if (!rule.applies(prov)) continue;
    if (!rule.violated(ctx)) continue;
    out.push({ rule, shot_id: prov.shot_id, in_force_by: inForce });
  }
  return out;
}

/** Evaluate a whole scene (many shots). */
export function evaluateScene(
  provenance: ShotProvenance[],
  profile: ComplianceProfile,
  deps: EvaluateDeps,
): RuleViolation[] {
  return provenance.flatMap((p) => evaluateShot(p, profile, deps));
}
