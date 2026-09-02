import { z } from "zod";
import { Timestamp } from "./primitives.js";

/**
 * Music & audio rights (Radar 2026 extension, roadmap R6).
 *
 * A cue sheet is the industry-standard document every broadcaster and PRO
 * (ASCAP/BMI/PRS) requires: every musical cue in the programme, who wrote and
 * publishes it, how it's used, for how long, and whether it's cleared. Radar
 * generates it from the per-scene music cues and turns each uncleared cue into a
 * `music_rights` finding — then the signed certificate carries the cue sheet as
 * an appendix. Deterministic (S1).
 */

export const MusicUse = z.enum(["background", "featured", "theme", "logo", "source"]);
export type MusicUse = z.infer<typeof MusicUse>;

export const LicenseStatus = z.enum([
  "cleared",
  "pending",
  "unlicensed",
  "public_domain",
  "production_music", // library/production music under a blanket licence
]);
export type LicenseStatus = z.infer<typeof LicenseStatus>;

export const LicenseType = z.enum(["sync", "master", "sync_and_master", "blanket", "none"]);
export type LicenseType = z.infer<typeof LicenseType>;

export const MusicCue = z
  .object({
    cue_id: z.string().min(1),
    scene_id: z.string().min(1),
    title: z.string().min(1),
    writers: z.array(z.string()).default([]),
    publisher: z.string().nullable().default(null),
    performer: z.string().nullable().default(null),
    use: MusicUse,
    duration_ms: z.number().int().min(0).default(0),
    timecode_in: z.string().nullable().default(null),
    license_status: LicenseStatus,
    license_type: LicenseType.default("none"),
    /** link into the Consent/rights registry for the executed licence. */
    license_ref: z.string().nullable().default(null),
    source: z.string().nullable().default(null),
  })
  .strict();
export type MusicCue = z.infer<typeof MusicCue>;

export const CueSheet = z
  .object({
    scene_id: z.string().min(1),
    production_title: z.string(),
    cues: z.array(MusicCue),
    total_cues: z.number().int().min(0),
    cleared_cues: z.number().int().min(0),
    uncleared_cues: z.number().int().min(0),
    total_music_ms: z.number().int().min(0),
    generated_at: Timestamp,
  })
  .strict();
export type CueSheet = z.infer<typeof CueSheet>;
