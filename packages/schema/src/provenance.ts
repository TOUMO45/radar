import { z } from "zod";
import { Timestamp } from "./primitives.js";
import { WatermarkMethod } from "./compliance.js";

/**
 * Provenance VERIFICATION (Radar 2026 extension, roadmap R2).
 *
 * WHY THIS EXISTS
 * ---------------
 * The compliance vertical (`ShotProvenance`) records what a shot *claims* about
 * its provenance — "has a C2PA manifest", "watermark detectable". EU AI Act
 * Art. 50(2) does not ask for a claim; it asks for a machine-readable mark that
 * actually *verifies*. R2 turns "claims a watermark / C2PA" into "verified", by
 * running a real detector over the asset and recording the cryptographic result.
 *
 * The deterministic core here is the parser: given the report of a real C2PA
 * verifier (the ContentAuth `c2patool`), it classifies the manifest's integrity,
 * trust, AI-generation signal and watermark soft-binding. Model-free (S1).
 */

/**
 * IPTC DigitalSourceType values that denote wholly or partly AI-generated media.
 * A C2PA `c2pa.actions` assertion carrying one of these is a machine-readable
 * declaration that the asset is synthetic — the exact signal EU Art. 50 turns on.
 * Source: cv.iptc.org/newscodes/digitalsourcetype.
 */
export const IPTC_AI_SOURCE_TYPES = [
  "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
  "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
  "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced",
] as const;

export const C2paValidation = z
  .object({
    present: z.boolean(),
    /** hashes / claim signature verify — no tamper (independent of who signed). */
    integrity_ok: z.boolean(),
    /** the signer's certificate chains to a trusted C2PA anchor. */
    trusted: z.boolean(),
    /**
     * present AND integrity_ok — the asset carries an intact, machine-readable
     * Content Credential. Satisfies EU Art. 50(2)'s "machine-readable marking";
     * `trusted` is the separate, stronger question of *who* signed it.
     */
    verified: z.boolean(),
    signer: z.string().nullable(),
    signature_alg: z.string().nullable(),
    signed_at: z.string().nullable(),
    claim_generator: z.string().nullable(),
    /** a c2pa.actions assertion declares an AI digitalSourceType. */
    ai_generated_signal: z.boolean(),
    ai_source_type: z.string().nullable(),
    /** a c2pa.soft_binding assertion (a referenced watermark) is present. */
    soft_binding_watermark: z.boolean(),
    /** raw C2PA validation status codes reported by the verifier. */
    validation_codes: z.array(z.string()).default([]),
  })
  .strict();
export type C2paValidation = z.infer<typeof C2paValidation>;

export const WatermarkDetection = z
  .object({
    checked: z.boolean(),
    detected: z.boolean(),
    method: WatermarkMethod,
    /** which detector produced this result, e.g. "c2pa.soft_binding" / "synthid-vertex". */
    detector: z.string(),
    note: z.string().nullable().default(null),
  })
  .strict();
export type WatermarkDetection = z.infer<typeof WatermarkDetection>;

/** The verified provenance of one shot's asset — the output of a `ProvenancePort`. */
export const ProvenanceVerification = z
  .object({
    shot_id: z.string().min(1),
    asset_ref: z.string().nullable().default(null),
    c2pa: C2paValidation,
    watermark: WatermarkDetection,
    /** the adapter that produced this, e.g. "c2patool@0.27.16" / "dry-run". */
    detector: z.string(),
    checked_at: Timestamp,
  })
  .strict();
export type ProvenanceVerification = z.infer<typeof ProvenanceVerification>;
