import { z } from "zod";
import { RiskClass, Severity, Timestamp } from "./primitives.js";

/**
 * Quick Scan (additive capability, not part of the graded production
 * pipeline). Lets someone paste script text or upload a media file
 * DIRECTLY — no pre-registered production, no World State, no consent
 * registry — and get back a best-effort preliminary findings list.
 *
 * Deliberately its OWN type, not `Finding` v2: a full `Finding` carries
 * production-only fields (scene_id, entity_id, remediation, adjudication,
 * blocking-per-tau) that a standalone scan has no honest value for. Forcing
 * those onto a fake/placeholder value is exactly the "fake a result" this
 * capability is built to avoid — so `QuickScanFinding` only carries what a
 * standalone scan can actually support.
 */

export const QuickScanInputType = z.enum(["text", "image", "video"]);
export type QuickScanInputType = z.infer<typeof QuickScanInputType>;

export const QuickScanFinding = z
  .object({
    risk_class: RiskClass,
    rule: z.string().min(1),
    subject: z.string().nullable().default(null),
    severity: Severity,
    /** 0..1 — the raw match/detection confidence. Quick Scan never computes "blocking". */
    confidence: z.number().min(0).max(1),
    description: z.string(),
    recommendation: z.string(),
    evidence_quote: z.string().nullable().default(null),
  })
  .strict();
export type QuickScanFinding = z.infer<typeof QuickScanFinding>;

/** One axis Quick Scan could not evaluate at all, and exactly why. */
export const QuickScanNotApplicable = z
  .object({
    axis: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();
export type QuickScanNotApplicable = z.infer<typeof QuickScanNotApplicable>;

export const QuickScanResult = z
  .object({
    scan_id: z.string().min(1),
    input_type: QuickScanInputType,
    findings: z.array(QuickScanFinding),
    not_applicable: z.array(QuickScanNotApplicable),
    disclaimer: z.literal(
      "Quick Scan flags possible matches; it does not verify licensing status. It is not legal advice.",
    ),
    scanned_at: Timestamp,
  })
  .strict();
export type QuickScanResult = z.infer<typeof QuickScanResult>;
