import type { ConsentRecord, KgNode, ShotText } from "@scenelock/schema";
import { PRODUCTION_ID } from "./dry-run.js";

const T = "2026-08-20T00:00:00.000Z";

/**
 * Clearance Knowledge Graph seed (spec §11). Small, demo-sufficient corpus the
 * clearance gate matches against. In production the researcher curates this with
 * grounded citations (E.5.0, E.8).
 */
export const kg: KgNode[] = [
  {
    node_id: "brand_colara",
    kind: "brand",
    name: "Colara Classic",
    aliases: ["Colara", "Colara Cola"],
    owner: "Colara Beverage Co.",
    label_strings: ["COLARA CLASSIC", "COLARA", "CLASSIC COLA"],
    trademark_classes: ["32", "30"],
    citations: ["uspto:tm/colara-classic"],
    updated_at: T,
  },
  {
    node_id: "song_shelter",
    kind: "song",
    name: "Storm Shelter",
    aliases: ["Gimme Shelter"],
    rights_holder: "Rolling Notes Music Publishing",
    reference_lyrics: [
      "oh a storm is threatening my very life today",
      "if i dont get some shelter im gonna fade away",
      "war children its just a shot away",
    ],
    citations: ["mlc:song/storm-shelter"],
    updated_at: T,
  },
  {
    node_id: "figure_hargrove",
    kind: "figure",
    name: "Senator Dale Hargrove",
    aliases: ["Dale Hargrove", "Senator Hargrove"],
    role: "us_senator",
    living: true,
    citations: ["wikidata:Q-hargrove"],
    updated_at: T,
  },
];

/**
 * Consent Registry seed. Deliberately holds NO active release for Senator
 * Hargrove — that absence is what makes the real_person check fire (E.5.2).
 * One expired release is included to exercise the "expired" path.
 */
export const consentRecords: ConsentRecord[] = [
  {
    record_id: "consent_hargrove_old",
    production_id: PRODUCTION_ID,
    subject: "Senator Dale Hargrove",
    kind: "release",
    linked_entity_id: null,
    linked_figure_node_id: "figure_hargrove",
    doc_uri: "gs://radar-dev-org-org_demo/consent/consent_hargrove_old/release.pdf",
    expiry: "2025-06-30T00:00:00.000Z", // expired
    status: "expired",
    redaction_status: "clean",
    uploaded_by: "u_legal",
    created_at: "2024-01-10T00:00:00.000Z",
  },
];

/**
 * Per-shot script/dialogue + audio-cue + OCR-label text (E.5.0, E.5.2). The
 * clearance gate runs NER, lyric-window matching, and label edit-distance over
 * this. All of it is treated as UNTRUSTED input (G-13).
 *
 *  - `script`    : screenplay dialogue/action (NER for real_person)
 *  - `audio_cue` : what the DRY_RUN "ASR" returns for the generated audio (lyrics)
 *  - `ocr_label` : the noisy text the "vision model" read off a product label
 *                  in the frame (trademark). Absent = nothing readable.
 */
export const dialogue: Record<string, ShotText> = {
  shot_1: { script: "INT. FINANCE BULLPEN – NIGHT. Riya works alone at a terminal.", audio_cue: "" },
  shot_2: { script: "Riya sets a can beside her laptop.", audio_cue: "" },
  shot_3: {
    script: "She reaches for the can without looking.",
    audio_cue: "",
    // stylised can label, imperfectly read — a genuine near-match, not a certainty
    ocr_label: "COIA  CLASSIC",
  },
  shot_4: {
    script:
      "RIYA: You think Senator Dale Hargrove signed off on the Halvorsen account for free?",
    // hummed, half-caught by ASR — several reference tokens, no full line
    audio_cue: "hmm a storm threatening my life fading away today",
  },
  shot_5: { script: "Riya pulls her blazer from the chair and stands.", audio_cue: "" },
  shot_6: { script: "Wide on the empty bullpen. Elevator doors close.", audio_cue: "" },
};
