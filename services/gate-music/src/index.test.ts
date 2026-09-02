import { describe, expect, it } from "vitest";
import type { MusicCue } from "@scenelock/schema";
import { generateCueSheet, musicRightsGate } from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";

function cue(over: Partial<MusicCue> & Pick<MusicCue, "cue_id" | "title" | "use" | "license_status">): MusicCue {
  return {
    scene_id: "sc_12",
    writers: [],
    publisher: null,
    performer: null,
    duration_ms: 30000,
    timecode_in: null,
    license_type: "none",
    license_ref: null,
    source: null,
    ...over,
  };
}

describe("gate-music — cue sheet", () => {
  it("counts cleared vs uncleared and totals runtime", () => {
    const cues = [
      cue({ cue_id: "c1", title: "Shelter Storm", use: "featured", license_status: "unlicensed", duration_ms: 45000 }),
      cue({ cue_id: "c2", title: "Neon Drift", use: "background", license_status: "production_music", duration_ms: 20000 }),
      cue({ cue_id: "c3", title: "Public Air", use: "theme", license_status: "public_domain", duration_ms: 15000 }),
    ];
    const sheet = generateCueSheet(cues, "Neon Harbor", NOW);
    expect(sheet.total_cues).toBe(3);
    expect(sheet.cleared_cues).toBe(2);
    expect(sheet.uncleared_cues).toBe(1);
    expect(sheet.total_music_ms).toBe(80000);
  });
});

describe("gate-music — rights gate", () => {
  it("a featured unlicensed cue is a high, blocking finding", () => {
    const out = musicRightsGate.run({
      scene_id: "sc_12",
      cues: [cue({ cue_id: "c1", title: "Shelter Storm", use: "featured", license_status: "unlicensed", writers: ["J. Doe"] })],
      production_title: "Neon Harbor",
      tau: 0.7,
      now: NOW,
    });
    expect(out.findings).toHaveLength(1);
    const f = out.findings[0]!;
    expect(f.finding_id).toBe("f_mus_c1");
    expect(f.risk_class).toBe("music_rights");
    expect(f.severity).toBe("high");
    expect(f.blocking).toBe(true);
    expect(f.sub_gate).toBe("audio");
  });

  it("pending is milder; cleared/PD/production-music produce no finding", () => {
    const out = musicRightsGate.run({
      scene_id: "sc_12",
      cues: [
        cue({ cue_id: "c1", title: "Pending Track", use: "background", license_status: "pending" }),
        cue({ cue_id: "c2", title: "Cleared Track", use: "featured", license_status: "cleared" }),
        cue({ cue_id: "c3", title: "PD Track", use: "theme", license_status: "public_domain" }),
      ],
      production_title: "Neon Harbor",
      tau: 0.7,
      now: NOW,
    });
    expect(out.findings.map((f) => f.finding_id)).toEqual(["f_mus_c1"]);
    expect(out.findings[0]!.severity).toBe("low");
    expect(out.cue_sheet.uncleared_cues).toBe(1);
  });
});
