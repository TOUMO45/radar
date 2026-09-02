import type { RiskClass } from "@scenelock/schema";

/**
 * Model-as-explainer seam (spec S1, E.5.1). The deterministic core decides;
 * the explainer only fills human-readable `description` + `recommendation`.
 * G-13: any untrusted evidence text passed in is DATA — the explainer never
 * treats it as an instruction and never emits it unescaped as a directive.
 */
export interface ExplainInput {
  risk_class: RiskClass;
  rule: string;
  shot_id: string;
  subject?: string; // brand / song / figure name — from the curated KG, trusted
  measurement?: { metric: string; value: number; threshold?: number };
  untrusted_evidence?: string | null; // OCR / ASR / dialogue — DATA ONLY
}

export interface Explanation {
  description: string;
  recommendation: string;
}

export interface Explainer {
  explain(input: ExplainInput): Explanation;
}

/** Deterministic template explainer. The Gemini-backed one implements the same interface later. */
export class TemplateExplainer implements Explainer {
  explain(i: ExplainInput): Explanation {
    switch (i.risk_class) {
      case "ai_disclosure":
        return i.rule === "c2pa_generator_mismatch"
          ? {
              description: `Shot ${i.shot_id}'s C2PA manifest is present but its generator claim does not match this shot's Veo job — a possible payload swap.`,
              recommendation: "Re-export the shot from the Veo pipeline so the manifest's generator matches the job id, then re-run clearance.",
            }
          : {
              description: `Shot ${i.shot_id} has ${i.rule === "c2pa_manifest_invalid" ? "an invalid" : "no"} C2PA manifest. Provenance and AI-generation disclosure cannot be verified for this shot.`,
              recommendation: "Re-export the shot through the Veo pipeline so a signed C2PA manifest is embedded, then re-run clearance.",
            };
      case "real_person":
        return {
          description: `Dialogue in shot ${i.shot_id} names ${i.subject ?? "a public figure"} and no active Consent Registry record covers the reference.`,
          recommendation: `Replace with a cleared fictional name, or obtain a release for ${i.subject ?? "the named figure"} and file it in the Consent Registry.`,
        };
      case "trademark":
        return {
          description: `A label read in shot ${i.shot_id} is a near-match (${fmt(i.measurement)}) to the registered trademark "${i.subject ?? "unknown"}"; no licensing record is attached.`,
          recommendation: `Swap the prop for a cleared label, or attach a licensing record for "${i.subject ?? "the brand"}" before lock.`,
        };
      case "lyrics":
        return {
          description: `Audio/dialogue in shot ${i.shot_id} matches (${fmt(i.measurement)}) a reference lyric window from "${i.subject ?? "a catalogued song"}".`,
          recommendation: `Swap for a cleared library cue, or license the referenced track from the rights holder.`,
        };
      default:
        return { description: `${i.risk_class}: ${i.rule} on shot ${i.shot_id}.`, recommendation: "" };
    }
  }
}

function fmt(m?: ExplainInput["measurement"]): string {
  if (!m) return "match";
  return `${m.metric} ${m.value.toFixed(2)}${m.threshold !== undefined ? ` vs τ ${m.threshold}` : ""}`;
}
