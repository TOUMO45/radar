import { z } from "zod";
import { GcsUri, SCHEMA_VERSION, Timestamp } from "./primitives.js";
import { CueSheet } from "./music.js";

/**
 * Clearance certificate payload (spec §8, Appendix D).
 * Deterministic, KMS-signed, hash-chained (D2, G-15). The verifier service
 * exposes GET /verify/:slug against this (G-16, F.1).
 */

export const DISCLAIMER =
  "Attests what was checked and what humans decided. Not a legal opinion.";

export const CertificatePayload = z
  .object({
    project: z.string().min(1),
    scene: z.string().min(1),
    lock_timestamp: Timestamp,
    final_world_state: z.string().min(1), // snapshot-ref:gs://...
    findings: z.array(z.string()).default([]), // human-readable outcome lines
    evidence_chain: z.object({
      frames: z.array(GcsUri).default([]),
      quotes: z.array(z.string()).default([]),
      embedding_versions: z.array(z.string()).default([]),
    }),
    c2pa_manifests: z.array(GcsUri).default([]),
    /** music-clearance appendix — the PRO cue sheet (R6), null when no cues. */
    music_appendix: CueSheet.nullable().default(null),
    disclaimer: z.literal(DISCLAIMER).default(DISCLAIMER),
    schema_version: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    prior_certificate_hash: z.string().nullable().default(null),
    certificate_hash: z.string().min(1),
    kms_key_version: z.string().min(1),
    verification_slug: z.string().min(1),
  })
  .strict();
export type CertificatePayload = z.infer<typeof CertificatePayload>;

/** Stored certificate document (E.7 `…/certificates/{cid}`). */
export const Certificate = z
  .object({
    certificate_id: z.string().min(1),
    production_id: z.string().min(1),
    scene_id: z.string().min(1),
    slug: z.string().min(1),
    payload: CertificatePayload,
    /** detached signature over the canonical payload bytes (mock KMS in DRY_RUN). */
    signature: z.string().min(1),
    created_at: Timestamp,
    revoked: z.boolean().default(false),
  })
  .strict();
export type Certificate = z.infer<typeof Certificate>;

export const VerifyResult = z
  .object({
    slug: z.string().min(1),
    status: z.enum(["valid", "revoked", "unknown"]),
    scene: z.string(),
    project: z.string(),
    lock_timestamp: Timestamp.nullable(),
    certificate_hash: z.string().nullable(),
    prior_certificate_hash: z.string().nullable(),
    /** recomputed hash matches the stored one AND the prev-hash chain is intact. */
    chain_ok: z.boolean(),
    signature_ok: z.boolean(),
    disclaimer: z.string(),
  })
  .strict();
export type VerifyResult = z.infer<typeof VerifyResult>;
