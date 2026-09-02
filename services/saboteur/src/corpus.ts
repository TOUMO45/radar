import type { StoragePort } from "@scenelock/ports";
import type { RiskClass } from "@scenelock/schema";

/**
 * Evasion corpus (spec §10). Each case mutates one shot's inputs on a fresh
 * store, then a gate runs against it. `expectation: "caught"` means a finding of
 * `risk_class` must be raised; `"clean"` means none should be (a false positive
 * if one is).
 */
export interface EvasionCase {
  id: string;
  risk_class: RiskClass;
  gate: "clearance" | "continuity";
  shot_id: string;
  expectation: "caught" | "clean";
  note: string;
  apply: (storage: StoragePort) => Promise<void>;
}

export const CORPUS_VERSION = "scenebench-corpus@2026-08-1";

export const CORPUS: EvasionCase[] = [
  {
    id: "lyr-split-line",
    risk_class: "lyrics",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "caught",
    note: "reference lyric words split across filler — window matcher must still hit",
    apply: async (s) => {
      const cue = "oh — a storm, you know — is threatening my very life, uh, today";
      const d = (await s.getDialogue("shot_2"))!;
      await s.putDialogue("shot_2", { ...d, audio_cue: cue });
      const m = await s.getMediaArtifacts("shot_2");
      if (m) await s.putMediaArtifacts({ ...m, transcript: cue });
    },
  },
  {
    id: "tm-garbled-label",
    risk_class: "trademark",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "caught",
    note: "OCR reads a mangled but near version of the registered label",
    apply: async (s) => {
      const d = (await s.getDialogue("shot_2"))!;
      await s.putDialogue("shot_2", { ...d, ocr_label: "C0LARA  CLASSlC" });
    },
  },
  {
    id: "rp-midline-name",
    risk_class: "real_person",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "caught",
    note: "public figure named mid-sentence, lowercased",
    apply: async (s) => {
      const d = (await s.getDialogue("shot_2"))!;
      await s.putDialogue("shot_2", {
        ...d,
        script: "she muttered that senator dale hargrove would never sign it and kept typing",
      });
    },
  },
  {
    id: "aidisc-payload-swap",
    risk_class: "ai_disclosure",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "caught",
    note: "valid manifest but its generator claim doesn't match this shot's Veo job",
    apply: async (s) => {
      const shot = (await s.getShot("shot_2"))!;
      await s.putShot({ ...shot, veo_job_id: "veo-job-REAL" });
      const media = await s.getMediaArtifacts("shot_2");
      if (media) await s.putMediaArtifacts({ ...media, c2pa: { ...media.c2pa, generator: "veo-job-FORGED" } });
    },
  },
  {
    id: "aidisc-clean",
    risk_class: "ai_disclosure",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "clean",
    note: "correct signed manifest whose generator matches — must NOT fire",
    apply: async () => {},
  },
  {
    id: "tm-cleared-label",
    risk_class: "trademark",
    gate: "clearance",
    shot_id: "shot_2",
    expectation: "clean",
    note: "a cleared house-brand label not in the KG — must NOT fire",
    apply: async (s) => {
      const d = (await s.getDialogue("shot_2"))!;
      await s.putDialogue("shot_2", { ...d, ocr_label: "VANTAGE COLA" });
    },
  },
  {
    id: "ct-state-mismatch",
    risk_class: "continuity.state",
    gate: "continuity",
    shot_id: "shot_2",
    expectation: "caught",
    note: "prop in the wrong position vs the World State ledger",
    apply: async (s) => {
      const plan = (await s.getContinuity("shot_2"))!;
      await s.putContinuity("shot_2", {
        ...plan,
        observed: plan.observed.map((o) =>
          o.entity_id === "SC12-PROP-CAN-01" ? { ...o, observed_state: "on_screen(under_the_desk)" } : o,
        ),
      });
    },
  },
  {
    id: "ct-clean",
    risk_class: "continuity.state",
    gate: "continuity",
    shot_id: "shot_2",
    expectation: "clean",
    note: "everything matches the plan — must NOT fire",
    apply: async () => {},
  },
];
