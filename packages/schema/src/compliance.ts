import { z } from "zod";
import { C2paState, Severity, Timestamp } from "./primitives.js";

/**
 * Synthetic-media compliance & provenance contract (Radar 2026 extension).
 *
 * WHY THIS EXISTS
 * ---------------
 * From 2026, shipping AI-generated film is a *legal* act, not just a creative
 * one. Radar already proves continuity and clearance; this module adds the third
 * axis the market now demands — provable, jurisdiction-aware *deliverability*:
 *
 *   - EU AI Act, Article 50 (applies 2026-08-02): synthetic output must carry a
 *     machine-readable mark (C2PA + watermark); deep fakes must be disclosed; a
 *     deep fake depicting a real person needs a *perceptible* on-screen label.
 *   - California AB 1836 (2026-01-01): no digital replica of a *deceased*
 *     performer without estate consent (min. statutory damages).
 *   - California AB 2602 (2025-01-01): a *living* performer's replica needs a
 *     specific, represented consent — else the use is unenforceable.
 *   - New York Synthetic Performer Disclosure (2026-06-09): a synthetic performer
 *     must be clearly and conspicuously disclosed.
 *   - Platform policies (TikTok / YouTube / Meta / broadcast / SVOD): each runs
 *     its own AI-label regime; there is no single rule.
 *
 * The rules themselves live in `@scenelock/rulepack`; this module is the data
 * they read (ShotProvenance) and the target set they read against
 * (ComplianceProfile), plus the two aggregate outputs (TrustScore,
 * DeliveryReadiness). All deterministic — model-free (S1).
 */

/** Territories Radar encodes law for. GLOBAL = always-on baseline. */
export const Jurisdiction = z.enum([
  "EU",
  "US_CA",
  "US_NY",
  "US_FEDERAL",
  "AU",
  "UK",
  "CN", // China — AI-generated content labeling measures (2025)
  "GLOBAL",
]);
export type Jurisdiction = z.infer<typeof Jurisdiction>;

/** Distribution / delivery targets, each with its own AI-disclosure policy. */
export const Platform = z.enum([
  "tiktok",
  "youtube",
  "meta",
  "instagram",
  "x", // X (formerly Twitter)
  "broadcast_tv",
  "svod", // subscription VOD (Netflix-style delivery)
  "theatrical",
  "festival",
]);
export type Platform = z.infer<typeof Platform>;

/** What a shot's synthetic subject is, w.r.t. real-person likeness law. */
export const ReplicaKind = z.enum([
  "none", // no real/replica person depicted
  "living_performer", // digital replica of a living, identifiable performer
  "deceased_performer", // digital replica of a deceased performer (AB 1836)
  "synthetic_performer", // wholly AI-invented performer (NY disclosure)
  "real_public_figure", // depiction of a real public figure (politician, etc.)
]);
export type ReplicaKind = z.infer<typeof ReplicaKind>;

/** How (if at all) the shot is watermarked. SynthID detection needs Google infra. */
export const WatermarkMethod = z.enum(["none", "synthid", "c2pa_soft", "other"]);
export type WatermarkMethod = z.infer<typeof WatermarkMethod>;

export const WatermarkState = z
  .object({
    present: z.boolean(),
    method: WatermarkMethod.default("none"),
    /** whether a detector could actually verify it (false for unverifiable claims). */
    detectable: z.boolean().default(false),
  })
  .strict();
export type WatermarkState = z.infer<typeof WatermarkState>;

/**
 * Deterministic provenance facts about one shot — the compliance gate's input.
 * Stored per shot alongside continuity/dialogue (E.7 access pattern).
 */
export const ShotProvenance = z
  .object({
    shot_id: z.string().min(1),
    is_ai_generated: z.boolean().default(true),
    /** realistic enough to be mistaken for real footage → EU Art.50(4) trigger. */
    is_deepfake: z.boolean().default(false),
    depicts_real_person: z.boolean().default(false),
    replica_kind: ReplicaKind.default("none"),
    subject_name: z.string().nullable().default(null),
    /** link into the Consent Registry (record_id) if a release/licence is filed. */
    consent_record_id: z.string().nullable().default(null),
    c2pa: C2paState.nullable().default(null),
    watermark: WatermarkState.default({ present: false, method: "none", detectable: false }),
    /** a viewer-visible "AI-generated" label burned into / overlaid on the shot. */
    perceptible_label: z.object({ present: z.boolean() }).default({ present: false }),
    generator: z.string().nullable().default(null), // e.g. veo model id
  })
  .strict();
export type ShotProvenance = z.infer<typeof ShotProvenance>;

/** Where this production intends to distribute — sets which rules are in force. */
export const ComplianceProfile = z
  .object({
    production_id: z.string().min(1),
    territories: z.array(Jurisdiction).default(["GLOBAL"]),
    platforms: z.array(Platform).default([]),
  })
  .strict();
export type ComplianceProfile = z.infer<typeof ComplianceProfile>;

// --- aggregate outputs -------------------------------------------------------

export const TrustBand = z.enum(["green", "amber", "red"]);
export type TrustBand = z.infer<typeof TrustBand>;

export const TrustDimension = z
  .object({
    key: z.enum(["continuity", "clearance", "provenance", "consent", "compliance"]),
    label: z.string(),
    score: z.number().min(0).max(100),
    weight: z.number().min(0).max(1),
    detail: z.string(),
  })
  .strict();
export type TrustDimension = z.infer<typeof TrustDimension>;

/**
 * Radar Trust Score — one 0–100 headline number for a scene: the figure an
 * insurer, broadcaster or festival programmer can read at a glance. Deterministic
 * weighted roll-up of the same findings/coverage the verdict uses.
 */
export const TrustScore = z
  .object({
    scene_id: z.string().min(1),
    score: z.number().min(0).max(100),
    band: TrustBand,
    breakdown: z.array(TrustDimension),
    headline: z.string(),
    computed_at: Timestamp,
  })
  .strict();
export type TrustScore = z.infer<typeof TrustScore>;

export const DeliveryTargetKind = z.enum(["jurisdiction", "platform"]);
export type DeliveryTargetKind = z.infer<typeof DeliveryTargetKind>;

export const DeliveryTargetResult = z
  .object({
    kind: DeliveryTargetKind,
    id: z.string().min(1), // jurisdiction or platform value
    label: z.string(),
    ready: z.boolean(),
    blocking_finding_ids: z.array(z.string()).default([]),
    blocking_rule_ids: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    max_severity: Severity.nullable().default(null),
  })
  .strict();
export type DeliveryTargetResult = z.infer<typeof DeliveryTargetResult>;

/**
 * Delivery Readiness — can this scene legally ship to each target territory and
 * platform, right now? The report a producer takes to distribution.
 */
export const DeliveryReadiness = z
  .object({
    scene_id: z.string().min(1),
    ready: z.boolean(),
    targets: z.array(DeliveryTargetResult),
    computed_at: Timestamp,
  })
  .strict();
export type DeliveryReadiness = z.infer<typeof DeliveryReadiness>;
