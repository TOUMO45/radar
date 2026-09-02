import { z } from "zod";

/**
 * Continuity gate inputs (spec E.5.1). In production these come from grounded
 * detection over keyframes + Vertex AI identity embeddings; in DRY_RUN they are
 * a per-shot fixture (the "shot plan" the planner registered + what the gate saw).
 */
export const ContinuityObservation = z
  .object({
    entity_id: z.string().min(1),
    present: z.boolean(),
    /** free-text state descriptor the gate observed, e.g. "on_screen(left_of_laptop)". */
    observed_state: z.string().nullable().default(null),
    /** cosine(frame embedding, character anchor) — characters only. */
    identity_cosine: z.number().min(-1).max(1).nullable().default(null),
  })
  .strict();
export type ContinuityObservation = z.infer<typeof ContinuityObservation>;

export const ShotContinuity = z
  .object({
    shot_id: z.string().min(1),
    /** expected state descriptor per entity — from the shot plan / World State ledger. */
    expected: z.record(z.string(), z.string()).default({}),
    observed: z.array(ContinuityObservation).default([]),
    /** entities seen in frame that are not in the plan. */
    unexpected: z.array(z.string()).default([]),
    /** identity cosine threshold (default T_id 0.82, spec E.5.1). */
    identity_threshold: z.number().min(0).max(1).default(0.82),
    embedding_model_version: z.string().default("gemini-embed-001@2026-03"),
  })
  .strict();
export type ShotContinuity = z.infer<typeof ShotContinuity>;
