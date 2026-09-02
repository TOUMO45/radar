import { z } from "zod";
import { Timestamp, Verdict } from "./primitives.js";

/**
 * Scene lifecycle (B.2) and the verdict_inputs snapshot (E.4).
 * The certificate and the UI Verdict Math Bar both render from verdict_inputs.
 */

export const SceneStatus = z.enum([
  "draft",
  "preflight_complete",
  "generating",
  "in_qa",
  "held",
  "locked",
  "certified",
]);
export type SceneStatus = z.infer<typeof SceneStatus>;

export const VerdictReason = z.enum([
  "ok",
  "open_blocking_findings",
  "incomplete_gate_coverage",
  "incomplete_c2pa_coverage",
  "shots_not_ready",
  "kill_switch_engaged",
]);
export type VerdictReason = z.infer<typeof VerdictReason>;

/** Immutable snapshot of everything the verdict was computed from (E.4). */
export const VerdictInputs = z
  .object({
    snapshot_ref: z.string().min(1),
    tau: z.number().min(0).max(1),
    config_version: z.string().min(1),
    blocking_open: z.number().int().min(0),
    blocking_finding_ids: z.array(z.string()).default([]),
    gate_coverage: z.object({
      required: z.number().int().min(0),
      completed: z.number().int().min(0),
      label: z.string(), // e.g. "6/6"
    }),
    c2pa_coverage: z.object({
      shots: z.number().int().min(0),
      valid: z.number().int().min(0),
      label: z.string(), // e.g. "5/6"
    }),
    shots_total: z.number().int().min(0),
    shots_gates_complete: z.number().int().min(0),
    kill_switch: z.boolean().default(false),
    computed_at: Timestamp,
  })
  .strict();
export type VerdictInputs = z.infer<typeof VerdictInputs>;

export const SceneVerdict = z
  .object({
    scene_id: z.string().min(1),
    verdict: Verdict,
    reason: VerdictReason,
    inputs: VerdictInputs,
  })
  .strict();
export type SceneVerdict = z.infer<typeof SceneVerdict>;

export const Scene = z
  .object({
    scene_id: z.string().min(1),
    production_id: z.string().min(1),
    index: z.number().int().min(0),
    heading: z.string().default(""),
    status: SceneStatus,
    verdict: SceneVerdict.nullable().default(null),
  })
  .strict();
export type Scene = z.infer<typeof Scene>;
