import { randomUUID } from "node:crypto";
import { phrasePresent, windowMatch } from "@scenelock/gate-clearance";
import { gateCompliance } from "@scenelock/gate-compliance";
import {
  C2paToolProvenanceAdapter,
  DryRunProvenanceAdapter,
  c2patoolAvailable,
} from "@scenelock/provenance";
import type {
  ComplianceProfile,
  QuickScanFinding,
  QuickScanInputType,
  QuickScanNotApplicable,
  QuickScanResult,
  ShotProvenance,
} from "@scenelock/schema";
import { QUICKSCAN_BRANDS, QUICKSCAN_FIGURES, QUICKSCAN_SONGS } from "./watchlist.js";

export * from "./watchlist.js";

/**
 * Quick Scan (additive capability — see packages/schema/src/quickscan.ts's
 * doc comment for the full "why"). Runs ONLY the checks Step 0 confirmed
 * genuinely standalone: trademark/lyric/real-person NAME matching against
 * Quick Scan's OWN watchlist (services/quickscan/src/watchlist.ts, never
 * packages/fixtures), real C2PA verification via @scenelock/provenance, and
 * the compliance-labeling rule engine (already a pure function). Everything
 * that genuinely needs a registered production — continuity, and the
 * consent-verification half of real_person — is reported as
 * `not_applicable`, never silently skipped or faked.
 */

export const QUICKSCAN_DISCLAIMER =
  "Quick Scan flags possible matches; it does not verify licensing status. It is not legal advice." as const;

const LYRIC_THRESHOLD = 0.55;

function newScanId(): string {
  return `qs_${randomUUID().slice(0, 8)}`;
}

function baseResult(input_type: QuickScanInputType, now: string): Omit<QuickScanResult, "findings" | "not_applicable"> {
  return {
    scan_id: newScanId(),
    input_type,
    disclaimer: QUICKSCAN_DISCLAIMER,
    scanned_at: now,
  };
}

/** Continuity is not_applicable for every Quick Scan, unconditionally — Step 0's finding. */
function continuityNotApplicable(): QuickScanNotApplicable {
  return {
    axis: "continuity",
    reason:
      "Continuity checks expected-vs-observed state for entities registered in a production's World " +
      "State across shots over time. There is no World State without a registered production — this " +
      "axis cannot run standalone, by design, not as a missing feature.",
  };
}

/** The consent half of real-person detection is not_applicable for every Quick Scan, unconditionally. */
function consentNotApplicable(): QuickScanNotApplicable {
  return {
    axis: "real_person.consent",
    reason:
      "A name match against the watchlist below only tells you a real person may be referenced — " +
      "whether consent/a release is on file is checked against a specific production's Consent " +
      "Registry, which does not exist for a standalone scan. Register a production to verify consent.",
  };
}

function scanTextForTrademark(text: string, now: string): QuickScanFinding[] {
  const out: QuickScanFinding[] = [];
  for (const brand of QUICKSCAN_BRANDS) {
    const candidates = [brand.name, ...brand.aliases, ...brand.label_strings];
    const hit = candidates.find((c) => phrasePresent(text, c));
    if (!hit) continue;
    out.push({
      risk_class: "trademark",
      rule: "quickscan_trademark_watchlist_match",
      subject: brand.name,
      severity: "high",
      confidence: 1.0,
      description: `Text references "${hit}", a watchlisted trademark (${brand.name}, owner: ${brand.owner || "unknown"}).`,
      recommendation: "Confirm licensing/permission to reference this brand, or remove/replace before distribution.",
      evidence_quote: firstLineWith(text, hit),
    });
  }
  void now;
  return out;
}

function scanTextForLyrics(text: string, now: string): QuickScanFinding[] {
  const out: QuickScanFinding[] = [];
  let best: { song: (typeof QUICKSCAN_SONGS)[number]; score: number; line: string } | null = null;
  for (const song of QUICKSCAN_SONGS) {
    for (const line of song.reference_lyrics) {
      const s = windowMatch(text, line, 8);
      if (!best || s > best.score) best = { song, score: s, line };
    }
  }
  if (best && best.score >= LYRIC_THRESHOLD) {
    out.push({
      risk_class: "lyrics",
      rule: "quickscan_lyrics_watchlist_match",
      subject: best.song.name,
      severity: "high",
      confidence: round2(best.score),
      description: `Text matches reference lyrics for "${best.song.name}" (rights holder: ${best.song.rights_holder || "unknown"}).`,
      recommendation: "Confirm a sync/master licence is in place, or remove/replace the lyric before distribution.",
      evidence_quote: `matched: "${best.line}"`,
    });
  }
  void now;
  return out;
}

function scanTextForRealPerson(text: string, now: string): QuickScanFinding[] {
  const out: QuickScanFinding[] = [];
  for (const fig of QUICKSCAN_FIGURES) {
    const names = [fig.name, ...fig.aliases];
    const hit = names.find((n) => phrasePresent(text, n));
    if (!hit) continue;
    out.push({
      risk_class: "real_person",
      rule: "quickscan_real_person_watchlist_match",
      subject: fig.name,
      severity: "high",
      confidence: 1.0,
      description: `Text references "${hit}", a watchlisted real person (${fig.name}).`,
      recommendation: "Verify consent/release status via a registered production's Consent Registry before distribution.",
      evidence_quote: firstLineWith(text, hit),
    });
  }
  void now;
  return out;
}

/** Real C2PA verification via @scenelock/provenance — zero storage/production dependency. */
async function scanAssetForProvenance(
  assetPath: string,
  now: string,
): Promise<{ findings: QuickScanFinding[]; provenance: ShotProvenance }> {
  const useLive = c2patoolAvailable();
  const port = useLive ? new C2paToolProvenanceAdapter() : new DryRunProvenanceAdapter(() => now);
  const v = await port.verify({ shot_id: "quickscan", asset_ref: assetPath, declared: null });

  const findings: QuickScanFinding[] = [];
  if (!v.c2pa.present) {
    findings.push({
      risk_class: "ai_disclosure",
      rule: "quickscan_c2pa_absent",
      subject: null,
      severity: "medium",
      confidence: 1.0,
      description: `No C2PA manifest found on this asset (verified via ${v.detector}).`,
      recommendation: "If this asset is AI-generated, export it with a valid C2PA manifest and a detectable watermark.",
      evidence_quote: null,
    });
  } else if (!v.c2pa.verified) {
    findings.push({
      risk_class: "ai_disclosure",
      rule: "quickscan_c2pa_invalid",
      subject: null,
      severity: "high",
      confidence: 1.0,
      description: `A C2PA manifest is present but did not verify (${v.detector}): ${v.c2pa.validation_codes.join(", ") || "integrity check failed"}.`,
      recommendation: "Re-export the asset with a valid, unmodified C2PA manifest.",
      evidence_quote: null,
    });
  } else {
    findings.push({
      risk_class: "ai_disclosure",
      rule: "quickscan_c2pa_verified",
      subject: v.c2pa.signer,
      severity: "info",
      confidence: 1.0,
      description: `A valid C2PA manifest verified successfully (signer: ${v.c2pa.signer ?? "unknown"}, alg: ${v.c2pa.signature_alg ?? "unknown"}).${v.c2pa.ai_generated_signal ? " Manifest declares this asset as AI-generated." : ""}`,
      recommendation: "No action needed for provenance — the manifest is intact.",
      evidence_quote: v.c2pa.validation_codes.length ? v.c2pa.validation_codes.join(", ") : null,
    });
  }

  // Fold the REAL verified result into a minimal ShotProvenance for the
  // compliance-labeling check below. Fields we have no way to detect
  // (is_deepfake, replica_kind, perceptible_label) stay at their honest,
  // conservative default rather than an assumed/faked value; is_ai_generated
  // is assumed true because that's the case Quick Scan exists to check, and
  // is called out as an assumption in the compliance finding's description
  // where it matters (see scanComplianceLabeling).
  const provenance: ShotProvenance = {
    shot_id: "quickscan",
    is_ai_generated: true,
    is_deepfake: false,
    depicts_real_person: false,
    replica_kind: "none",
    subject_name: null,
    consent_record_id: null,
    c2pa: { present: v.c2pa.present, valid: v.c2pa.verified, manifest_uri: null },
    watermark: {
      present: v.watermark.detected,
      method: v.watermark.method,
      detectable: v.watermark.detected,
    },
    perceptible_label: { present: false },
    generator: v.c2pa.claim_generator,
  };
  return { findings, provenance };
}

/** Compliance-labeling — already a pure, storage-free function (Step 0 finding). */
function scanComplianceLabeling(provenance: ShotProvenance, now: string): QuickScanFinding[] {
  const profile: ComplianceProfile = { production_id: "quickscan", territories: ["GLOBAL"], platforms: [] };
  const report = gateCompliance.run({
    scene_id: "quickscan",
    provenance: [provenance],
    profile,
    consentRecords: [],
    tau: 0.7,
    now,
  });
  return report.findings.map((f) => ({
    risk_class: f.risk_class,
    rule: f.rule,
    subject: null,
    severity: f.severity,
    confidence: f.confidence,
    description: `${f.description} (assumes this asset is AI-generated — Quick Scan cannot detect that directly; territory assumed GLOBAL only).`,
    recommendation: f.recommendation,
    evidence_quote: null,
  }));
}

export interface QuickScanTextInput {
  kind: "text";
  text: string;
}
export interface QuickScanAssetInput {
  kind: "image" | "video";
  assetPath: string;
}
export type QuickScanRunInput = QuickScanTextInput | QuickScanAssetInput;

export async function runQuickScan(input: QuickScanRunInput, now: string = new Date().toISOString()): Promise<QuickScanResult> {
  const not_applicable: QuickScanNotApplicable[] = [continuityNotApplicable()];

  if (input.kind === "text") {
    const findings = [
      ...scanTextForTrademark(input.text, now),
      ...scanTextForLyrics(input.text, now),
      ...scanTextForRealPerson(input.text, now),
    ];
    not_applicable.push(consentNotApplicable());
    not_applicable.push({
      axis: "ai_disclosure",
      reason: "No media asset was submitted — there is nothing to verify a C2PA manifest against for a text-only scan.",
    });
    not_applicable.push({
      axis: "compliance_labeling",
      reason: "Compliance-labeling rules (watermark/manifest presence) apply to media assets, not to text input.",
    });
    return { ...baseResult("text", now), findings, not_applicable };
  }

  // image | video
  const { findings: provenanceFindings, provenance } = await scanAssetForProvenance(input.assetPath, now);
  const complianceFindings = scanComplianceLabeling(provenance, now);
  not_applicable.push(consentNotApplicable());
  not_applicable.push({
    axis: "trademark",
    reason: "Quick Scan's trademark/lyric checks run over TEXT (script or OCR'd label text); this is a raw media scan with no text extracted.",
  });
  not_applicable.push({
    axis: "lyrics",
    reason: "No audio transcript or script text was extracted from this media asset for Quick Scan to check.",
  });
  not_applicable.push({
    axis: "real_person",
    reason: "Name matching runs over script/dialogue text; this is a raw media scan with no text extracted.",
  });

  return {
    ...baseResult(input.kind, now),
    findings: [...provenanceFindings, ...complianceFindings],
    not_applicable,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function firstLineWith(text: string, needle: string): string {
  const lines = text.split(/\r?\n|(?<=[.!?])\s+/);
  const nd = needle.toLowerCase();
  return (lines.find((l) => l.toLowerCase().includes(nd)) ?? text).trim().slice(0, 240);
}
