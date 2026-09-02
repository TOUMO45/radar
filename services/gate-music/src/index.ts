import {
  computeBlocking,
  type CueSheet,
  type Finding,
  type MusicCue,
} from "@scenelock/schema";

/**
 * Music & audio rights (roadmap R6). Deterministic (S1).
 *
 * `generateCueSheet` assembles the PRO-standard cue sheet from a scene's music
 * cues; `MusicRightsGate` turns each uncleared cue into a Finding v2
 * (gate=clearance, sub_gate=audio, risk_class=music_rights) so it flows through
 * the same blocking/verdict machinery. Surfaced via endpoint + the certificate
 * appendix, not injected into the seed findings[] (same contract as compliance).
 */

const UNCLEARED = new Set(["unlicensed", "pending"]);

export function generateCueSheet(
  cues: MusicCue[],
  productionTitle: string,
  now: string,
): CueSheet {
  const cleared = cues.filter((c) => !UNCLEARED.has(c.license_status)).length;
  return {
    scene_id: cues[0]?.scene_id ?? "",
    production_title: productionTitle,
    cues,
    total_cues: cues.length,
    cleared_cues: cleared,
    uncleared_cues: cues.length - cleared,
    total_music_ms: cues.reduce((a, c) => a + c.duration_ms, 0),
    generated_at: now,
  };
}

function cueToFinding(cue: MusicCue, tau: number, now: string): Finding {
  // an unlicensed featured cue is the worst case; a pending or background cue is milder.
  const severity: Finding["severity"] =
    cue.license_status === "unlicensed" && (cue.use === "featured" || cue.use === "theme")
      ? "high"
      : cue.license_status === "unlicensed"
        ? "medium"
        : "low";
  const f: Finding = {
    finding_id: `f_mus_${cue.cue_id}`,
    scene_id: cue.scene_id,
    shot_id: null,
    frame: null,
    gate: "clearance",
    sub_gate: "audio",
    stage: "shot",
    risk_class: "music_rights",
    rule: `music.${cue.license_status}`,
    description: `Music cue "${cue.title}"${cue.writers.length ? ` (${cue.writers.join(", ")})` : ""} is ${cue.license_status} — used as ${cue.use}${cue.publisher ? `, publisher ${cue.publisher}` : ""}.`,
    recommendation:
      cue.license_status === "pending"
        ? `Execute and file the ${cue.license_type === "none" ? "sync + master" : cue.license_type} licence for "${cue.title}" and link it to the cue.`
        : `Clear "${cue.title}" (sync + master), swap it for production music, or remove it before delivery.`,
    severity,
    confidence: 1.0,
    measurement: null,
    evidence_uri: null,
    evidence_quote: null,
    status: "open",
    source: "deterministic",
    entity_id: null,
    state_expected: null,
    state_observed: null,
    remediation: null,
    c2pa: null,
    adjudication: null,
    blocking: false,
    created_at: now,
    schema_version: "2.1",
  };
  f.blocking = computeBlocking(f, tau);
  return f;
}

export interface MusicInput {
  scene_id: string;
  cues: MusicCue[];
  production_title: string;
  tau: number;
  now: string;
}

export interface MusicRunResult {
  cue_sheet: CueSheet;
  findings: Finding[];
}

export class MusicRightsGate {
  run(input: MusicInput): MusicRunResult {
    const cue_sheet = generateCueSheet(input.cues, input.production_title, input.now);
    const findings = input.cues
      .filter((c) => UNCLEARED.has(c.license_status))
      .map((c) => cueToFinding(c, input.tau, input.now));
    return { cue_sheet, findings };
  }
}

export const musicRightsGate = new MusicRightsGate();
