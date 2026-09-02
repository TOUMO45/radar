import { z } from "zod";
import {
  C2paState,
  Gate,
  GateRunStatus,
  GcsUri,
  SubGate,
  Timestamp,
} from "./primitives.js";

/**
 * Shot lifecycle (B.2) and gate_run records (E.5.4).
 * Coverage for the lock rule is computed from gate_runs (G-02).
 */

export const ShotStatus = z.enum([
  "planned",
  "generating",
  "ready",
  "gate_running",
  "gates_complete",
  "held",
  "regenerating",
  "locked",
  "failed_infra",
]);
export type ShotStatus = z.infer<typeof ShotStatus>;

export const GateRun = z
  .object({
    gate: Gate,
    sub_gate: SubGate.default(null),
    shot_id: z.string().min(1),
    status: GateRunStatus,
    started_at: Timestamp.nullable().default(null),
    completed_at: Timestamp.nullable().default(null),
    duration_ms: z.number().int().min(0).nullable().default(null),
    model_versions: z.array(z.string()).default([]),
    error: z.string().nullable().default(null),
  })
  .strict();
export type GateRun = z.infer<typeof GateRun>;

export const Shot = z
  .object({
    shot_id: z.string().min(1),
    scene_id: z.string().min(1),
    index: z.number().int().min(0),
    status: ShotStatus,
    frame_count: z.number().int().min(0).default(0),
    uris: z
      .object({
        video: GcsUri.nullable().default(null),
        keyframes_prefix: GcsUri.nullable().default(null),
        audio: GcsUri.nullable().default(null),
      })
      .default({ video: null, keyframes_prefix: null, audio: null }),
    content_hash: z.string().nullable().default(null),
    c2pa: C2paState.nullable().default(null),
    veo_job_id: z.string().nullable().default(null),
    gate_runs: z.array(GateRun).default([]),
    attempt_no: z.number().int().min(0).default(0),
  })
  .strict();
export type Shot = z.infer<typeof Shot>;

/** The set of gate runs a fully-covered shot must have completed (E.4). */
export const REQUIRED_GATES: ReadonlyArray<{ gate: Gate; sub_gate: "audio" | null }> = [
  { gate: "continuity", sub_gate: null },
  { gate: "clearance", sub_gate: null },
  { gate: "clearance", sub_gate: "audio" },
];

/**
 * media-processor output (spec E.1, E.5.2). Carried on `shots.processed`.
 * C2PA read here is consumed by the clearance gate's ai_disclosure check.
 */
export const C2paRead = z
  .object({
    present: z.boolean(),
    valid: z.boolean(),
    /** the generator claim inside the manifest — compared to the shot's veo_job_id (payload-swap, E.5.2). */
    generator: z.string().nullable().default(null),
    signer_chain_ok: z.boolean().default(false),
    manifest_uri: GcsUri.nullable().default(null),
  })
  .strict();
export type C2paRead = z.infer<typeof C2paRead>;

/**
 * Per-shot untrusted text inputs to the clearance gate (E.5.0, E.5.2, G-13).
 *  script    — screenplay dialogue/action (NER for real_person)
 *  audio_cue — what ASR returns for the generated audio (lyrics)
 *  ocr_label — noisy label text a vision model read off a product in-frame (trademark)
 */
export const ShotText = z
  .object({
    script: z.string().default(""),
    audio_cue: z.string().default(""),
    ocr_label: z.string().optional(),
  })
  .strict();
export type ShotText = z.infer<typeof ShotText>;

export const MediaArtifacts = z
  .object({
    shot_id: z.string().min(1),
    keyframes: z.object({
      prefix: GcsUri.nullable().default(null),
      count: z.number().int().min(0).default(0),
      fps: z.number().min(0).default(1),
    }),
    audio: z.object({
      uri: GcsUri.nullable().default(null),
      sample_rate_hz: z.number().int().default(16000),
      channels: z.number().int().default(1),
      duration_ms: z.number().int().min(0).default(0),
    }),
    /** ASR transcript of the generated audio — feeds the lyric matcher (E.5.3). */
    transcript: z.string().default(""),
    c2pa: C2paRead,
    content_hash: z.string().min(1),
    processed_at: Timestamp,
  })
  .strict();
export type MediaArtifacts = z.infer<typeof MediaArtifacts>;
