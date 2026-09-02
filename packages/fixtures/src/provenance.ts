import type { ComplianceProfile, ShotProvenance } from "@scenelock/schema";
import { PRODUCTION_ID } from "./dry-run.js";

/**
 * DRY_RUN provenance seed — the 2026 synthetic-media compliance layer of the
 * "Neon Harbor" demo. Deterministic inputs the compliance gate reasons over.
 *
 * Narrative (extends Act 1):
 *   - Riya is a wholly AI-invented lead → synthetic_performer. No shot burns in a
 *     visible AI label yet → NY synthetic-performer disclosure fires (US_NY).
 *   - shot_4 features a "portrait comes alive" cameo of a DECEASED actor,
 *     Vivian Marsh, with no estate release on file → California AB 1836 (blocking).
 *     It's a realistic real-person deep fake with no perceptible label → EU Art.50(4).
 *   - shot_6 shipped with no C2PA AND no watermark → EU Art.50(2) marking missing.
 *
 * A production targeting EU + California + New York, delivering to SVOD/YouTube/
 * TikTok, is therefore NOT deliverable until these are resolved — which is exactly
 * what Delivery Readiness and the Trust Score surface.
 */

const veo = "veo-3@2026-05";

function base(shotId: string, over: Partial<ShotProvenance> = {}): ShotProvenance {
  return {
    shot_id: shotId,
    is_ai_generated: true,
    is_deepfake: false,
    depicts_real_person: false,
    replica_kind: "none",
    subject_name: null,
    consent_record_id: null,
    c2pa: { present: true, valid: true, manifest_uri: null },
    watermark: { present: true, method: "synthid", detectable: true },
    perceptible_label: { present: false },
    generator: veo,
    ...over,
  };
}

export const provenance: Record<string, ShotProvenance> = {
  // Riya (synthetic performer) present; marked but unlabeled.
  shot_1: base("shot_1", { replica_kind: "synthetic_performer", subject_name: "Riya Kapoor (synthetic)" }),
  shot_2: base("shot_2"),
  shot_3: base("shot_3", { replica_kind: "synthetic_performer", subject_name: "Riya Kapoor (synthetic)" }),
  // Deceased-actor digital-replica cameo, realistic, no label, no consent.
  shot_4: base("shot_4", {
    is_deepfake: true,
    depicts_real_person: true,
    replica_kind: "deceased_performer",
    subject_name: "Vivian Marsh",
    perceptible_label: { present: false },
  }),
  shot_5: base("shot_5", { replica_kind: "synthetic_performer", subject_name: "Riya Kapoor (synthetic)" }),
  // The undisclosed AI frame — no C2PA, no watermark (mirrors the seed's ai_disclosure finding).
  shot_6: base("shot_6", {
    c2pa: { present: false, valid: false, manifest_uri: null },
    watermark: { present: false, method: "none", detectable: false },
  }),
};

export const complianceProfile: ComplianceProfile = {
  production_id: PRODUCTION_ID,
  territories: ["GLOBAL", "EU", "US_CA", "US_NY"],
  platforms: ["svod", "youtube", "tiktok"],
};
