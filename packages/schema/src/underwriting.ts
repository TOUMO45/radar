import { z } from "zod";
import { Severity, Timestamp } from "./primitives.js";
import { TrustBand } from "./compliance.js";

/**
 * E&O / Underwriting Pack (Radar 2026 extension, roadmap R1).
 *
 * WHY THIS EXISTS
 * ---------------
 * From 2026, standard Errors & Omissions (E&O) policies *exclude* AI-generated
 * content unless the production can document three things: per-shot AI
 * disclosure, digital-replica consent, and an intact provenance chain. And every
 * major distributor requires the production to carry **$1M per claim / $3M
 * aggregate** E&O before it will sign a distribution deal.
 *
 * Radar already holds exactly what an underwriter asks for — it is spread across
 * the compliance gate (disclosure), the consent registry (consent), the media
 * pipeline (provenance / C2PA), the clearance gate (rights findings + waiver
 * trail) and the certifier (a signed, verifiable attestation). This module is the
 * one bundle that projects all of it into the binder an underwriter reads.
 *
 * It is a *radar, not a lawyer*: every line states what a public obligation
 * requires and whether the documented facts meet it. A human underwriter decides
 * whether to bind. Fully deterministic — no model, no keys (S1).
 */

/** One row of the underwriter's binder checklist — a documentable requirement. */
export const UnderwritingCheckStatus = z.enum(["pass", "fail", "na"]);
export type UnderwritingCheckStatus = z.infer<typeof UnderwritingCheckStatus>;

export const UnderwritingCheck = z
  .object({
    id: z.string().min(1),
    requirement: z.string().min(1),
    /** the public obligation / distributor requirement this maps to. */
    basis: z.string().min(1),
    status: UnderwritingCheckStatus,
    /** whether a `fail` here blocks binding coverage. */
    blocks_binding: z.boolean().default(true),
    detail: z.string(),
  })
  .strict();
export type UnderwritingCheck = z.infer<typeof UnderwritingCheck>;

/** Per-shot AI-disclosure + provenance record — the disclosure schedule. */
export const ShotDisclosure = z
  .object({
    shot_id: z.string().min(1),
    is_ai_generated: z.boolean(),
    generator: z.string().nullable(),
    is_deepfake: z.boolean(),
    replica_kind: z.string(),
    subject_name: z.string().nullable(),
    c2pa_present: z.boolean(),
    c2pa_valid: z.boolean(),
    watermark_method: z.string(),
    watermark_detectable: z.boolean(),
    perceptible_label: z.boolean(),
    /** does a real/replica person in this shot require a consent record? */
    consent_required: z.boolean(),
    consent_record_id: z.string().nullable(),
    consent_on_file: z.boolean(),
    /** documented = disclosure present AND (consent on file if required). */
    documented: z.boolean(),
    gaps: z.array(z.string()).default([]),
  })
  .strict();
export type ShotDisclosure = z.infer<typeof ShotDisclosure>;

/** A consent/release on file, flattened for the pack. */
export const ConsentLedgerEntry = z
  .object({
    record_id: z.string(),
    subject: z.string(),
    kind: z.string(),
    status: z.string(),
    expiry: z.string().nullable(),
    doc_uri: z.string().nullable(),
    linked_entity_id: z.string().nullable(),
  })
  .strict();
export type ConsentLedgerEntry = z.infer<typeof ConsentLedgerEntry>;

/** A clearance/compliance finding + its resolution trail. */
export const FindingLedgerEntry = z
  .object({
    finding_id: z.string(),
    shot_id: z.string().nullable(),
    risk_class: z.string(),
    severity: Severity,
    blocking: z.boolean(),
    status: z.string(),
    description: z.string(),
    /** waiver trail: who cleared it and why (D12), if adjudicated. */
    disposition: z.string().nullable(),
  })
  .strict();
export type FindingLedgerEntry = z.infer<typeof FindingLedgerEntry>;

/** The signed attestation reference (from the certifier), if the scene is LOCKED. */
export const CertificateRef = z
  .object({
    present: z.boolean(),
    certificate_id: z.string().nullable(),
    slug: z.string().nullable(),
    certificate_hash: z.string().nullable(),
    kms_key_version: z.string().nullable(),
    lock_timestamp: z.string().nullable(),
    verify_path: z.string().nullable(),
  })
  .strict();
export type CertificateRef = z.infer<typeof CertificateRef>;

/**
 * The whole pack — a single JSON bundle an insurer or distribution counsel can
 * ingest, and which `renderUnderwritingMarkdown` turns into a human binder.
 */
export const UnderwritingPack = z
  .object({
    pack_id: z.string().min(1),
    production_id: z.string().min(1),
    scene_id: z.string().min(1),
    generated_at: Timestamp,
    schema_version: z.literal("1.0"),

    production_summary: z
      .object({
        title: z.string(),
        org_id: z.string(),
        territories: z.array(z.string()),
        platforms: z.array(z.string()),
      })
      .strict(),

    /** headline: can an underwriter bind coverage from this pack as it stands? */
    bindable: z.boolean(),
    blocking_gaps: z.array(z.string()).default([]),
    coverage_note: z.string(),

    trust: z
      .object({ score: z.number().min(0).max(100), band: TrustBand, headline: z.string() })
      .strict(),
    delivery_ready: z.boolean(),
    delivery_targets: z
      .array(z.object({ label: z.string(), ready: z.boolean() }).strict())
      .default([]),

    checklist: z.array(UnderwritingCheck),
    shot_disclosures: z.array(ShotDisclosure),
    consent_ledger: z.array(ConsentLedgerEntry),
    findings_ledger: z.array(FindingLedgerEntry),
    certificate: CertificateRef,

    disclaimer: z.string(),
  })
  .strict();
export type UnderwritingPack = z.infer<typeof UnderwritingPack>;
