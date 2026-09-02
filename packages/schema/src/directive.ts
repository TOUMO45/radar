import { z } from "zod";
import { GcsUri, Timestamp } from "./primitives.js";

/**
 * Regeneration directive (spec §6, Appendix C).
 * invariants[] travel with the directive and are re-verified after regen;
 * an invariant violation is a NEW finding, never a silent pass (R2).
 */

export const AttemptState = z.enum([
  "compiled",
  "generating",
  "ingested",
  "verifying",
  "passed",
  "failed_iteration",
  "failed_infra",
]);
export type AttemptState = z.infer<typeof AttemptState>;

export const AttemptCost = z.object({
  veo_seconds: z.number().min(0).default(0),
  gemini_tokens: z.number().int().min(0).default(0),
  usd: z.number().min(0).default(0),
});
export type AttemptCost = z.infer<typeof AttemptCost>;

export const Attempt = z
  .object({
    attempt_no: z.number().int().min(1),
    directive_id: z.string().min(1),
    shot_id: z.string().min(1),
    state: AttemptState,
    cost: AttemptCost.default({ veo_seconds: 0, gemini_tokens: 0, usd: 0 }),
    latency_ms: z.number().int().min(0).nullable().default(null),
    outcome: z.string().nullable().default(null),
    /** manual regens still consume budget but are flagged (Flow D, E.12). */
    manual: z.boolean().default(false),
    created_at: Timestamp,
  })
  .strict();
export type Attempt = z.infer<typeof Attempt>;

export const Directive = z
  .object({
    directive_id: z.string().min(1),
    target_finding_id: z.string().min(1),
    shot_id: z.string().min(1),
    prompt_patch: z.string(),
    reference_images: z.array(GcsUri).default([]),
    invariants: z.array(z.string()).default([]),
    acceptance_criteria: z.array(z.string()).default([]),
    attempt_budget: z.number().int().min(0).default(2),
    manual: z.boolean().default(false),
    created_at: Timestamp,
  })
  .strict();
export type Directive = z.infer<typeof Directive>;
