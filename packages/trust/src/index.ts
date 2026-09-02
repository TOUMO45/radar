import type {
  ComplianceProfile,
  DeliveryReadiness,
  DeliveryTargetResult,
  Finding,
  Jurisdiction,
  Platform,
  Severity,
  ShotProvenance,
  TrustBand,
  TrustDimension,
  TrustScore,
} from "@scenelock/schema";
import type { RuleViolation } from "@scenelock/rulepack";

/**
 * Radar Trust Score + Delivery Readiness — deterministic roll-ups.
 *
 * These add no new judgement: they re-project the SAME findings/provenance the
 * gates already produced into the two numbers distribution actually asks for —
 * "how trustworthy is this scene?" (one 0–100) and "where can it ship right now?"
 */

const COMPLIANCE_RISK_CLASSES = new Set([
  "synthetic_media_disclosure",
  "deepfake_disclosure",
  "likeness_rights",
  "watermark_missing",
  "platform_policy",
]);

const SEVERITY_PENALTY: Record<Severity, number> = { high: 45, medium: 18, low: 6, info: 0 };

const isOpen = (f: Finding) => f.status === "open" || f.status === "in_remediation" || f.status === "escalated";

function dimensionScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) if (isOpen(f)) score -= SEVERITY_PENALTY[f.severity];
  return Math.max(0, Math.min(100, score));
}

function bandFor(score: number): TrustBand {
  if (score >= 85) return "green";
  if (score >= 60) return "amber";
  return "red";
}

export interface TrustInput {
  scene_id: string;
  provenance: ShotProvenance[];
  /** all findings for the scene (continuity + clearance + compliance). */
  findings: Finding[];
  now: string;
}

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  EU: "European Union (AI Act)",
  US_CA: "California",
  US_NY: "New York",
  US_FEDERAL: "US federal",
  AU: "Australia",
  UK: "United Kingdom",
  CN: "China (mainland)",
  GLOBAL: "Global baseline",
};
const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  meta: "Meta",
  instagram: "Instagram",
  x: "X",
  broadcast_tv: "Broadcast TV",
  svod: "SVOD (streaming)",
  theatrical: "Theatrical",
  festival: "Festival",
};

/** One 0–100 headline number for a scene. */
export function computeTrustScore(input: TrustInput): TrustScore {
  const { findings, provenance } = input;

  const byClass = (pred: (f: Finding) => boolean) => findings.filter(pred);
  const continuityF = byClass((f) => f.risk_class.startsWith("continuity."));
  const clearanceF = byClass(
    (f) => ["trademark", "lyrics", "real_person", "ai_disclosure"].includes(f.risk_class),
  );
  const complianceF = byClass((f) => COMPLIANCE_RISK_CLASSES.has(f.risk_class));

  // provenance coverage: fraction of AI shots that are both C2PA-valid and watermark-detectable
  const aiShots = provenance.filter((p) => p.is_ai_generated);
  const marked = aiShots.filter(
    (p) => p.c2pa?.present && p.c2pa?.valid && p.watermark.present && p.watermark.detectable,
  );
  const provenanceScore = aiShots.length === 0 ? 100 : Math.round((marked.length / aiShots.length) * 100);

  const dims: TrustDimension[] = [
    { key: "continuity", label: "Continuity integrity", score: dimensionScore(continuityF), weight: 0.25, detail: `${continuityF.filter(isOpen).length} open` },
    { key: "clearance", label: "Rights clearance", score: dimensionScore(clearanceF), weight: 0.2, detail: `${clearanceF.filter(isOpen).length} open` },
    { key: "compliance", label: "Synthetic-media compliance", score: dimensionScore(complianceF), weight: 0.35, detail: `${complianceF.filter(isOpen).length} open` },
    { key: "provenance", label: "Provenance coverage", score: provenanceScore, weight: 0.2, detail: `${marked.length}/${aiShots.length} shots marked` },
  ];

  const score = Math.round(dims.reduce((acc, d) => acc + d.score * d.weight, 0));
  const blockingLegal =
    complianceF.filter((f) => isOpen(f) && f.blocking).length +
    clearanceF.filter((f) => isOpen(f) && f.blocking).length;
  // Honest-radar rule: any unresolved BLOCKING legal/clearance issue means the
  // scene cannot ship — it can never read green, and reads red outright.
  const band: TrustBand = blockingLegal > 0 ? "red" : bandFor(score);
  const headline =
    band === "green"
      ? "Deliverable — no open blocking issues"
      : blockingLegal > 0
        ? `Held — ${blockingLegal} blocking legal/clearance issue${blockingLegal === 1 ? "" : "s"} to resolve`
        : "Review — open issues below the blocking threshold";

  return { scene_id: input.scene_id, score, band, breakdown: dims, headline, computed_at: input.now };
}

export interface DeliveryInput {
  scene_id: string;
  profile: ComplianceProfile;
  violations: RuleViolation[];
  now: string;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3 };
function maxSeverity(vs: RuleViolation[]): Severity | null {
  let best: Severity | null = null;
  for (const v of vs) if (best === null || SEVERITY_RANK[v.rule.severity] > SEVERITY_RANK[best]) best = v.rule.severity;
  return best;
}

/**
 * Per-territory / per-platform "can this ship now?" A target is NOT ready if it
 * has any `high` violation in force; medium/low become notes (ship-with-caveats).
 */
export function computeDeliveryReadiness(input: DeliveryInput): DeliveryReadiness {
  const targets: DeliveryTargetResult[] = [];

  const add = (kind: "jurisdiction" | "platform", id: string, label: string) => {
    const vs = input.violations.filter((v) => v.in_force_by === id);
    const high = vs.filter((v) => v.rule.severity === "high");
    targets.push({
      kind,
      id,
      label,
      ready: high.length === 0,
      blocking_finding_ids: high.map((v) => `f_cmp_${v.shot_id}_${v.rule.id}`),
      blocking_rule_ids: Array.from(new Set(high.map((v) => v.rule.id))),
      notes: Array.from(new Set(vs.filter((v) => v.rule.severity !== "high").map((v) => `${v.rule.citation}: ${v.rule.title}`))),
      max_severity: maxSeverity(vs),
    });
  };

  for (const j of input.profile.territories) if (j !== "GLOBAL") add("jurisdiction", j, JURISDICTION_LABELS[j]);
  // GLOBAL baseline always evaluated
  add("jurisdiction", "GLOBAL", JURISDICTION_LABELS.GLOBAL);
  for (const p of input.profile.platforms) add("platform", p, PLATFORM_LABELS[p]);

  const ready = targets.every((t) => t.ready);
  return { scene_id: input.scene_id, ready, targets, computed_at: input.now };
}
