import { z } from "zod";
import {
  AdjudicationDecision,
  C2paState,
  FindingSource,
  FindingStatus,
  Gate,
  GcsUri,
  Measurement,
  RiskClass,
  SCHEMA_VERSION,
  Severity,
  Stage,
  SubGate,
  Timestamp,
} from "./primitives.js";

/**
 * Finding schema v2 — the one schema across every gate (spec §5, Appendix A).
 * Fields marked NEW-v2.1 in the spec: sub_gate, stage, measurement, blocking.
 *
 * `blocking` is PRECOMPUTED by the backend (D5, G-14):
 *   blocking = severity === "high" && confidence >= tau(production) && stage === "shot"
 * Grafana and the Verdict Math Bar read this field; they never recompute tau.
 */

export const Adjudication = z.object({
  adjudication_id: z.string().min(1).optional(),
  finding_id: z.string().min(1).optional(),
  by: z.string().min(1),
  decision: AdjudicationDecision,
  reason: z.string(),
  at: Timestamp,
});
export type Adjudication = z.infer<typeof Adjudication>;

export const FindingRemediation = z.object({
  directive_id: z.string().min(1).nullable(),
  attempts: z.number().int().min(0),
  status: z.enum(["idle", "running", "passed", "failed", "escalated"]),
});
export type FindingRemediation = z.infer<typeof FindingRemediation>;

export const Finding = z
  .object({
    finding_id: z.string().min(1),
    scene_id: z.string().min(1),
    shot_id: z.string().min(1).nullable(),
    frame: z.number().int().min(0).nullable().optional(),

    gate: Gate,
    sub_gate: SubGate.default(null),
    stage: Stage,
    risk_class: RiskClass,
    rule: z.string().min(1),

    description: z.string(),
    recommendation: z.string().default(""),

    severity: Severity,
    /** Certainty of detection, NOT a measured similarity (G-07). Deterministic => 1.0. */
    confidence: z.number().min(0).max(1),
    measurement: Measurement.nullable().default(null),

    evidence_uri: GcsUri.nullable().default(null),
    evidence_quote: z.string().nullable().default(null),

    status: FindingStatus,
    source: FindingSource,

    entity_id: z.string().min(1).nullable().default(null),
    state_expected: z.string().nullable().default(null),
    state_observed: z.string().nullable().default(null),

    remediation: FindingRemediation.nullable().default(null),
    c2pa: C2paState.nullable().default(null),
    adjudication: Adjudication.nullable().default(null),

    /** Precomputed by the backend (D5). The single source of lock-relevance. */
    blocking: z.boolean(),

    created_at: Timestamp,
    schema_version: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  })
  .strict();

export type Finding = z.infer<typeof Finding>;

/**
 * Recompute `blocking` from a finding + the production threshold.
 * Kept here so backend, MCP and fixtures share one definition (D5).
 */
export function computeBlocking(
  f: Pick<Finding, "severity" | "confidence" | "stage" | "status">,
  tau: number,
): boolean {
  if (f.status === "waived" || f.status === "resolved") return false;
  return f.severity === "high" && f.confidence >= tau && f.stage === "shot";
}
