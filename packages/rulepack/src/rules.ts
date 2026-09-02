import type {
  Jurisdiction,
  Platform,
  RiskClass,
  Severity,
  ShotProvenance,
} from "@scenelock/schema";

/**
 * The rulepack — 2026 synthetic-media law + platform policy as data.
 *
 * Every rule is deterministic and CITED. Citations, effective dates and
 * penalties are drawn from public sources (see `references` at the bottom).
 * Radar is a radar, not a lawyer: a rule states what a public obligation
 * requires and whether the shot's provenance meets it — a human still decides.
 *
 * A rule maps 1:1 onto a Finding when violated (see @scenelock/gate-compliance).
 */

export interface RuleScope {
  /** territory this rule belongs to, or a delivery platform. */
  jurisdiction?: Jurisdiction;
  platform?: Platform;
}

export interface EvalContext {
  prov: ShotProvenance;
  /** true iff an active consent/release record covers `subject`. */
  hasActiveConsent: (subject: string | null) => boolean;
  now: string;
}

export interface ComplianceRule {
  id: string;
  scope: RuleScope;
  title: string;
  citation: string;
  /** ISO date the obligation applies from. */
  effective: string;
  penalty?: string;
  risk_class: RiskClass;
  severity: Severity;
  /** the machine `rule` key that lands on the Finding. */
  rule_key: string;
  recommendation: string;
  /** does this rule apply to this shot at all? */
  applies: (p: ShotProvenance) => boolean;
  /** given it applies, is the obligation unmet? */
  violated: (ctx: EvalContext) => boolean;
}

const hasValidC2pa = (p: ShotProvenance) => p.c2pa?.present === true && p.c2pa?.valid === true;
const hasDetectableWatermark = (p: ShotProvenance) =>
  p.watermark.present === true && p.watermark.detectable === true;
const hasAnyDisclosure = (p: ShotProvenance) =>
  p.perceptible_label.present || hasValidC2pa(p) || hasDetectableWatermark(p);

export const RULES: ComplianceRule[] = [
  // ---------------------------------------------------------------- GLOBAL ----
  {
    id: "global_watermark_present",
    scope: { jurisdiction: "GLOBAL" },
    title: "AI outputs should carry a detectable watermark",
    citation: "C2PA + SynthID industry baseline (OpenAI/Google alignment, 2026)",
    effective: "2026-01-01",
    risk_class: "watermark_missing",
    severity: "medium",
    rule_key: "watermark_absent_or_unverifiable",
    recommendation:
      "Export the shot through a watermarking generator (e.g. SynthID) and keep the C2PA manifest, so the mark is detectable downstream.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasDetectableWatermark(prov),
  },

  // -------------------------------------------------------------------- EU ----
  {
    id: "eu_ai_act_art50_2_machine_readable",
    scope: { jurisdiction: "EU" },
    title: "Synthetic output must be machine-readable as AI-generated",
    citation: "EU AI Act, Article 50(2)",
    effective: "2026-08-02",
    penalty: "up to €15,000,000 or 3% of global annual turnover",
    risk_class: "synthetic_media_disclosure",
    severity: "high",
    rule_key: "eu_art50_2_marking_missing",
    recommendation:
      "Ensure the shot carries BOTH a valid C2PA manifest and a detectable, transformation-resilient watermark before EU distribution.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !(hasValidC2pa(prov) && hasDetectableWatermark(prov)),
  },
  {
    id: "eu_ai_act_art50_4_deepfake_real_person_label",
    scope: { jurisdiction: "EU" },
    title: "A deep fake depicting a real person needs a perceptible label",
    citation: "EU AI Act, Article 50(4)",
    effective: "2026-08-02",
    penalty: "up to €15,000,000 or 3% of global annual turnover",
    risk_class: "deepfake_disclosure",
    severity: "high",
    rule_key: "eu_art50_4_perceptible_label_missing",
    recommendation:
      "Burn in / overlay a clear, viewer-visible 'AI-generated' label for this shot; a machine-readable mark alone is insufficient when a real person is depicted.",
    applies: (p) => p.is_deepfake && p.depicts_real_person,
    violated: ({ prov }) => !prov.perceptible_label.present,
  },
  {
    id: "eu_ai_act_art50_4_deepfake_disclosure",
    scope: { jurisdiction: "EU" },
    title: "Deep fakes must be disclosed as artificially generated",
    citation: "EU AI Act, Article 50(4)",
    effective: "2026-08-02",
    risk_class: "deepfake_disclosure",
    severity: "medium",
    rule_key: "eu_art50_4_disclosure_missing",
    recommendation:
      "Disclose the deep fake — a perceptible label or, at minimum, a valid C2PA/watermark mark that a viewer tool can surface.",
    applies: (p) => p.is_deepfake && !p.depicts_real_person,
    violated: ({ prov }) => !hasAnyDisclosure(prov),
  },

  // ---------------------------------------------------------------- US_CA ----
  {
    id: "ca_ab1836_deceased_replica_consent",
    scope: { jurisdiction: "US_CA" },
    title: "No digital replica of a deceased performer without estate consent",
    citation: "California AB 1836 (deceased personality digital replica)",
    effective: "2026-01-01",
    penalty: "statutory damages of at least $10,000",
    risk_class: "likeness_rights",
    severity: "high",
    rule_key: "ca_ab1836_deceased_replica_no_consent",
    recommendation:
      "File an estate consent/release for this deceased performer in the Consent Registry and link it to the shot, or replace the likeness.",
    applies: (p) => p.replica_kind === "deceased_performer",
    violated: (ctx) => !ctx.hasActiveConsent(ctx.prov.subject_name),
  },
  {
    id: "ca_ab2602_living_replica_consent",
    scope: { jurisdiction: "US_CA" },
    title: "A living performer's digital replica needs represented consent",
    citation: "California AB 2602 (living performer digital replica)",
    effective: "2025-01-01",
    penalty: "use is unenforceable absent specific, represented consent",
    risk_class: "likeness_rights",
    severity: "high",
    rule_key: "ca_ab2602_living_replica_no_consent",
    recommendation:
      "Attach a specific, counsel/union-represented consent for this performer's replica to the Consent Registry before use.",
    applies: (p) => p.replica_kind === "living_performer",
    violated: (ctx) => !ctx.hasActiveConsent(ctx.prov.subject_name),
  },

  // ---------------------------------------------------------------- US_NY ----
  {
    id: "ny_synthetic_performer_disclosure",
    scope: { jurisdiction: "US_NY" },
    title: "A synthetic performer must be clearly and conspicuously disclosed",
    citation: "New York Synthetic Performer Disclosure Law",
    effective: "2026-06-09",
    risk_class: "synthetic_media_disclosure",
    severity: "medium",
    rule_key: "ny_synthetic_performer_disclosure_missing",
    recommendation:
      "Add a clear, conspicuous disclosure that a synthetic performer is used (perceptible label on the shot or in the surrounding content).",
    applies: (p) => p.replica_kind === "synthetic_performer",
    violated: ({ prov }) => !prov.perceptible_label.present,
  },

  // ----------------------------------------------------------- US_FEDERAL ----
  {
    id: "us_federal_digital_replica_consent",
    scope: { jurisdiction: "US_FEDERAL" },
    title: "A digital replica of a real person needs consent (federal)",
    citation: "US NO FAKES Act (federal digital-replica right, proposed) + TAKE IT DOWN Act (2025)",
    effective: "2025-05-19",
    penalty: "civil liability per work; removal obligations (TAKE IT DOWN Act)",
    risk_class: "likeness_rights",
    severity: "high",
    rule_key: "us_federal_digital_replica_no_consent",
    recommendation:
      "File a consent/release for this real person's digital replica in the Consent Registry, or replace the likeness, before US distribution.",
    applies: (p) =>
      p.depicts_real_person &&
      (p.replica_kind === "living_performer" ||
        p.replica_kind === "deceased_performer" ||
        p.replica_kind === "real_public_figure"),
    violated: (ctx) => !ctx.hasActiveConsent(ctx.prov.subject_name),
  },

  // ------------------------------------------------------------------- AU ----
  {
    id: "au_broadcast_synthetic_voice_disclosure",
    scope: { jurisdiction: "AU" },
    title: "Australia: synthetic voices / deep fakes in broadcast must be disclosed",
    citation: "Australian broadcast & synthetic-voice disclosure code (2026)",
    effective: "2026-01-01",
    risk_class: "deepfake_disclosure",
    severity: "medium",
    rule_key: "au_synthetic_disclosure_missing",
    recommendation:
      "Add a clear disclosure for synthetic performers or deep fakes before Australian broadcast/streaming distribution.",
    applies: (p) => p.is_deepfake || p.replica_kind === "synthetic_performer",
    violated: ({ prov }) => !hasAnyDisclosure(prov),
  },

  // ------------------------------------------------------------------- UK ----
  {
    id: "uk_realistic_deepfake_disclosure",
    scope: { jurisdiction: "UK" },
    title: "UK: realistic deep fakes of real people should be disclosed",
    citation: "UK Ofcom Broadcasting Code + Online Safety Act 2023 (synthetic media)",
    effective: "2025-01-01",
    risk_class: "deepfake_disclosure",
    severity: "medium",
    rule_key: "uk_deepfake_disclosure_missing",
    recommendation:
      "Provide a perceptible disclosure for realistic deep fakes depicting real people before UK distribution.",
    applies: (p) => p.is_deepfake && p.depicts_real_person,
    violated: ({ prov }) => !prov.perceptible_label.present && !hasAnyDisclosure(prov),
  },

  // ------------------------------------------------------------------- CN ----
  {
    id: "cn_ai_content_explicit_label",
    scope: { jurisdiction: "CN" },
    title: "China: AI-generated content needs an explicit label",
    citation: "PRC Measures for Labeling AI-Generated Synthetic Content (eff. 2025-09-01)",
    effective: "2025-09-01",
    penalty: "administrative liability under CAC deep-synthesis rules",
    risk_class: "synthetic_media_disclosure",
    severity: "high",
    rule_key: "cn_ai_explicit_label_missing",
    recommendation:
      "Add a viewer-visible ('explicit') AI label to the shot for mainland-China distribution; a metadata mark alone is not sufficient.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !prov.perceptible_label.present,
  },
  {
    id: "cn_ai_content_implicit_label",
    scope: { jurisdiction: "CN" },
    title: "China: AI-generated content needs an implicit (metadata) label",
    citation: "PRC Measures for Labeling AI-Generated Synthetic Content (eff. 2025-09-01)",
    effective: "2025-09-01",
    risk_class: "watermark_missing",
    severity: "medium",
    rule_key: "cn_ai_implicit_label_missing",
    recommendation:
      "Embed an 'implicit' machine-readable mark (C2PA metadata and/or watermark) as required alongside the explicit label.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !(hasValidC2pa(prov) || hasDetectableWatermark(prov)),
  },

  // --------------------------------------------------------------- PLATFORM ----
  {
    id: "tiktok_aigc_label",
    scope: { platform: "tiktok" },
    title: "TikTok: realistic AI people/scenes need a visible AIGC label",
    citation: "TikTok AI-generated content policy (2026, C2PA-based)",
    effective: "2026-01-01",
    risk_class: "platform_policy",
    severity: "medium",
    rule_key: "tiktok_aigc_label_missing",
    recommendation:
      "Enable the AIGC label (or burn in a visible AI disclosure); TikTok auto-detects C2PA but a visible label is required for realistic depictions.",
    applies: (p) => p.is_deepfake || p.depicts_real_person,
    violated: ({ prov }) => !prov.perceptible_label.present && !hasValidC2pa(prov),
  },
  {
    id: "youtube_altered_synthetic_disclosure",
    scope: { platform: "youtube" },
    title: "YouTube: altered/synthetic realistic content must be disclosed",
    citation: "YouTube Altered or Synthetic Content disclosure policy",
    effective: "2024-03-18",
    risk_class: "platform_policy",
    severity: "medium",
    rule_key: "youtube_altered_synthetic_disclosure_missing",
    recommendation:
      "Set the 'altered or synthetic content' disclosure for this upload; repeated failures carry penalties.",
    applies: (p) => p.is_deepfake,
    violated: ({ prov }) => !prov.perceptible_label.present,
  },
  {
    id: "meta_ai_info_label",
    scope: { platform: "meta" },
    title: "Meta: photorealistic AI media needs an 'AI info' label",
    citation: "Meta AI-content labeling policy",
    effective: "2024-05-01",
    risk_class: "platform_policy",
    severity: "low",
    rule_key: "meta_ai_info_label_missing",
    recommendation:
      "Provide an AI disclosure via a perceptible label or embedded C2PA/watermark metadata Meta can read.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasAnyDisclosure(prov),
  },
  {
    id: "svod_content_credentials_delivery",
    scope: { platform: "svod" },
    title: "SVOD delivery: AI shots must carry Content Credentials",
    citation: "SVOD technical delivery spec — C2PA Content Credentials",
    effective: "2026-01-01",
    risk_class: "platform_policy",
    severity: "medium",
    rule_key: "svod_c2pa_delivery_missing",
    recommendation:
      "Re-export the shot with a valid, signed C2PA manifest so it passes the platform's delivery QC.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasValidC2pa(prov),
  },
  {
    id: "broadcast_synthetic_disclosure",
    scope: { platform: "broadcast_tv" },
    title: "Broadcast: synthetic performers/deep fakes must be disclosed",
    citation: "Broadcast synthetic-media disclosure code (2026)",
    effective: "2026-01-01",
    risk_class: "platform_policy",
    severity: "medium",
    rule_key: "broadcast_synthetic_disclosure_missing",
    recommendation:
      "Add an on-air disclosure for synthetic performers or deep fakes used in the programme.",
    applies: (p) => p.is_deepfake || p.replica_kind !== "none",
    violated: ({ prov }) => !prov.perceptible_label.present,
  },
  {
    id: "festival_ai_content_disclosure",
    scope: { platform: "festival" },
    title: "Festival submission: AI content must be declared",
    citation: "Festival AI-content submission disclosure",
    effective: "2025-01-01",
    risk_class: "platform_policy",
    severity: "low",
    rule_key: "festival_ai_disclosure_missing",
    recommendation:
      "Declare AI-generated shots in the submission and keep provenance (C2PA) available for the programming committee.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasAnyDisclosure(prov),
  },
  {
    id: "instagram_ai_info_label",
    scope: { platform: "instagram" },
    title: "Instagram: photorealistic AI media needs an 'AI info' label",
    citation: "Meta / Instagram AI-content labeling policy",
    effective: "2024-05-01",
    risk_class: "platform_policy",
    severity: "low",
    rule_key: "instagram_ai_info_label_missing",
    recommendation:
      "Provide an AI disclosure via a perceptible label or embedded C2PA/watermark metadata Instagram can read.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasAnyDisclosure(prov),
  },
  {
    id: "x_synthetic_media_label",
    scope: { platform: "x" },
    title: "X: significantly altered/synthetic media should be labeled",
    citation: "X synthetic & manipulated media policy",
    effective: "2024-01-01",
    risk_class: "platform_policy",
    severity: "low",
    rule_key: "x_synthetic_media_label_missing",
    recommendation:
      "Label deceptive/realistic synthetic media on X, or attach C2PA so the platform can surface provenance.",
    applies: (p) => p.is_deepfake || p.depicts_real_person,
    violated: ({ prov }) => !prov.perceptible_label.present && !hasValidC2pa(prov),
  },
  {
    id: "theatrical_dcp_provenance",
    scope: { platform: "theatrical" },
    title: "Theatrical (DCP): AI shots should carry provenance for delivery QC",
    citation: "Theatrical DCP delivery — C2PA provenance (2026 practice)",
    effective: "2026-01-01",
    risk_class: "platform_policy",
    severity: "low",
    rule_key: "theatrical_dcp_provenance_missing",
    recommendation:
      "Keep a valid C2PA manifest for each AI shot in the DCP delivery package for the distributor's QC.",
    applies: (p) => p.is_ai_generated,
    violated: ({ prov }) => !hasValidC2pa(prov),
  },
];

/** All jurisdictions/platforms the rulepack actually covers (for UI + docs). */
export const COVERED_JURISDICTIONS = Array.from(
  new Set(RULES.map((r) => r.scope.jurisdiction).filter((x): x is Jurisdiction => !!x)),
);
export const COVERED_PLATFORMS = Array.from(
  new Set(RULES.map((r) => r.scope.platform).filter((x): x is Platform => !!x)),
);

/**
 * references (public sources consulted when authoring these rules):
 *  - EU AI Act Article 50 — transparency obligations, applies 2026-08-02.
 *  - California AB 1836 (deceased digital replicas), AB 2602 (living performers).
 *  - New York Synthetic Performer Disclosure Law (eff. 2026-06-09).
 *  - TikTok / YouTube / Meta / Instagram / X AI-content labeling policies (2026).
 *  - US NO FAKES Act (proposed) + TAKE IT DOWN Act (2025) — federal digital replicas.
 *  - Australian broadcast synthetic-voice code; UK Ofcom Code + Online Safety Act 2023.
 *  - PRC Measures for Labeling AI-Generated Synthetic Content (eff. 2025-09-01).
 *  - Theatrical DCP provenance (C2PA) delivery practice (2026).
 *  - C2PA Content Credentials (v2.3, Jan 2026) + Google SynthID.
 */
