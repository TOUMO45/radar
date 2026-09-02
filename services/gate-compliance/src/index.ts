import {
  computeBlocking,
  hasActiveConsent,
  type ComplianceProfile,
  type ConsentRecord,
  type Finding,
  type ShotProvenance,
} from "@scenelock/schema";
import { evaluateShot, type RuleViolation } from "@scenelock/rulepack";

/**
 * The Compliance Gate (Radar 2026 extension).
 *
 * Deterministic like every other gate (S1): it turns rulepack violations into
 * Finding v2 objects under the `clearance` gate. It adds no new *required* gate,
 * so the lock-coverage math is unchanged — but because these are ordinary
 * findings, a high-severity legal violation flows through `blocking` and the
 * verdict/loop/certificate machinery for free (D5).
 */

export interface ComplianceInput {
  scene_id: string;
  provenance: ShotProvenance[];
  profile: ComplianceProfile;
  consentRecords: ConsentRecord[];
  /** per-production confidence threshold; drives `blocking` (E.4). */
  tau: number;
  now: string;
}

export interface ComplianceReport {
  scene_id: string;
  findings: Finding[];
  violations: RuleViolation[];
  /** distinct territories/platforms that produced at least one violation. */
  failing_targets: string[];
  by_shot: Record<string, Finding[]>;
}

function violationToFinding(v: RuleViolation, sceneId: string, tau: number, now: string): Finding {
  const r = v.rule;
  const target = r.scope.jurisdiction ?? r.scope.platform ?? "GLOBAL";
  const inForce = `in force from ${r.effective}${r.penalty ? ` · penalty: ${r.penalty}` : ""}`;
  const finding: Finding = {
    finding_id: `f_cmp_${v.shot_id}_${r.id}`,
    scene_id: sceneId,
    shot_id: v.shot_id,
    frame: null,
    gate: "clearance",
    sub_gate: null,
    stage: "shot",
    risk_class: r.risk_class,
    rule: r.rule_key,
    description: `${r.title}. Required by ${r.citation} (${inForce}) — activated by delivery target ${target}.`,
    recommendation: r.recommendation,
    severity: r.severity,
    confidence: 1.0, // deterministic obligation check (G-07)
    measurement: null,
    evidence_uri: null,
    evidence_quote: null,
    status: "open",
    source: "deterministic",
    entity_id: null,
    state_expected: null,
    state_observed: null,
    remediation: null,
    c2pa: null,
    adjudication: null,
    blocking: false,
    created_at: now,
    schema_version: "2.1",
  };
  // precompute blocking with the production τ (D5) so the finding is correct standalone
  finding.blocking = computeBlocking(finding, tau);
  return finding;
}

export class GateCompliance {
  /** Pure evaluation over explicit inputs — storage-free, fully testable. */
  run(input: ComplianceInput): ComplianceReport {
    const consentIndex = (subject: string | null) =>
      subject !== null && hasActiveConsent(input.consentRecords, subject, input.now);

    const violations: RuleViolation[] = [];
    for (const prov of input.provenance) {
      violations.push(
        ...evaluateShot(prov, input.profile, { hasActiveConsent: consentIndex, now: input.now }),
      );
    }

    const findings = violations.map((v) => violationToFinding(v, input.scene_id, input.tau, input.now));
    const by_shot: Record<string, Finding[]> = {};
    for (const f of findings) (by_shot[f.shot_id!] ??= []).push(f);

    const failing_targets = Array.from(new Set(violations.map((v) => v.in_force_by)));

    return { scene_id: input.scene_id, findings, violations, failing_targets, by_shot };
  }
}

export const gateCompliance = new GateCompliance();
