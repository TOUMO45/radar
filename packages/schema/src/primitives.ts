import { z } from "zod";

/**
 * Shared scalars and enums for the Radar contract.
 * Spec refs: Part B (object model), Appendix A/B/C/D, E.11 (Loki label contract).
 */

export const SCHEMA_VERSION = "2.1" as const;

/** ISO-8601 timestamp string. */
export const Timestamp = z.string().datetime({ offset: true });

/** gs:// object URI. */
export const GcsUri = z
  .string()
  .regex(/^gs:\/\/[a-z0-9][a-z0-9._-]*\/.+/i, "must be a gs:// object URI");

export const Severity = z.enum(["info", "low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

/** Deterministic ground truth vs model explainer vs deterministic-trigger+model-explain. */
export const FindingSource = z.enum(["deterministic", "model", "hybrid"]);
export type FindingSource = z.infer<typeof FindingSource>;

/** Which gate produced a finding. Sub-gates are namespaced separately (Appendix A, G-08). */
export const Gate = z.enum(["continuity", "clearance", "delivery"]);
export type Gate = z.infer<typeof Gate>;

export const SubGate = z.enum(["audio"]).nullable();
export type SubGate = z.infer<typeof SubGate>;

/** preflight findings are visible warnings but never block (E.4). */
export const Stage = z.enum(["preflight", "shot"]);
export type Stage = z.infer<typeof Stage>;

/** Finding lifecycle (B.2). */
export const FindingStatus = z.enum([
  "open",
  "in_remediation",
  "resolved",
  "waived",
  "escalated",
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

export const RiskClass = z.enum([
  // clearance
  "trademark",
  "lyrics",
  "real_person",
  "ai_disclosure",
  // compliance family (2026 synthetic-media law + platform policy) — see compliance.ts
  "synthetic_media_disclosure", // machine-readable marking / disclosure missing (EU Art.50(2), NY)
  "deepfake_disclosure", // perceptible label for a real-person deepfake missing (EU Art.50(4))
  "likeness_rights", // digital replica without consent (CA AB 1836 / AB 2602)
  "watermark_missing", // no detectable AI watermark (EU Art.50(2), C2PA+SynthID)
  "platform_policy", // target delivery platform's AI-label policy not met
  // technical delivery family (R4) — IMF/broadcast/theatrical master QC
  "technical_delivery",
  // music & audio rights family (R6)
  "music_rights",
  // continuity family
  "continuity.state",
  "continuity.identity",
  "continuity.unexpected",
  "continuity.presence",
  // infrastructure
  "gate_error",
]);
export type RiskClass = z.infer<typeof RiskClass>;

/** Gate run status — coverage is computed from these (E.5.4, G-02). */
export const GateRunStatus = z.enum(["running", "completed", "failed"]);
export type GateRunStatus = z.infer<typeof GateRunStatus>;

/** Adjudication decisions (F.1 POST /findings/:fid/adjudication). */
export const AdjudicationDecision = z.enum(["confirm", "waive", "override"]);
export type AdjudicationDecision = z.infer<typeof AdjudicationDecision>;

/** RBAC roles (B.1). */
export const Role = z.enum([
  "producer",
  "qa_reviewer",
  "legal",
  "sre_admin",
  "viewer",
  "service",
]);
export type Role = z.infer<typeof Role>;

export const ProductionMode = z.enum(["live", "dry_run"]);
export type ProductionMode = z.infer<typeof ProductionMode>;

/** Scene verdict values (E.4, F.2). */
export const Verdict = z.enum(["LOCKED", "HELD", "CERTIFIED"]);
export type Verdict = z.infer<typeof Verdict>;

/**
 * Measured value, kept separate from certainty (G-07).
 * Deterministic findings emit confidence 1.0; the measured similarity/score lives here.
 */
export const Measurement = z.object({
  metric: z.string().min(1),
  value: z.number(),
  threshold: z.number().optional(),
});
export type Measurement = z.infer<typeof Measurement>;

export const C2paState = z.object({
  present: z.boolean(),
  valid: z.boolean(),
  manifest_uri: GcsUri.nullable().optional(),
});
export type C2paState = z.infer<typeof C2paState>;
