import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { ShotProvenance } from "@scenelock/schema";
import {
  C2paToolProvenanceAdapter,
  DryRunProvenanceAdapter,
  c2patoolAvailable,
  resolveC2patoolBin,
} from "./index.js";

const fixture = (name: string) => fileURLToPath(new URL(`../test-fixtures/${name}`, import.meta.url));

describe("DryRunProvenanceAdapter (always runs — no binary)", () => {
  const adapter = new DryRunProvenanceAdapter(() => "2026-09-02T00:00:00.000Z");

  it("maps a declared, marked AI shot to a verified-looking result", async () => {
    const declared: ShotProvenance = {
      shot_id: "shot_1",
      is_ai_generated: true,
      is_deepfake: false,
      depicts_real_person: false,
      replica_kind: "none",
      subject_name: null,
      consent_record_id: null,
      c2pa: { present: true, valid: true, manifest_uri: null },
      watermark: { present: true, method: "synthid", detectable: true },
      perceptible_label: { present: false },
      generator: "veo-3",
    };
    const v = await adapter.verify({ shot_id: "shot_1", declared });
    expect(v.detector).toBe("dry-run");
    expect(v.c2pa.present).toBe(true);
    expect(v.c2pa.verified).toBe(true);
    expect(v.c2pa.ai_generated_signal).toBe(true);
    expect(v.watermark.detected).toBe(true);
    expect(v.watermark.method).toBe("synthid");
  });

  it("a shot with no C2PA and no watermark verifies as unmarked", async () => {
    const declared: ShotProvenance = {
      shot_id: "shot_6",
      is_ai_generated: true,
      is_deepfake: false,
      depicts_real_person: false,
      replica_kind: "none",
      subject_name: null,
      consent_record_id: null,
      c2pa: null,
      watermark: { present: false, method: "none", detectable: false },
      perceptible_label: { present: false },
      generator: "veo-3",
    };
    const v = await adapter.verify({ shot_id: "shot_6", declared });
    expect(v.c2pa.present).toBe(false);
    expect(v.c2pa.verified).toBe(false);
    expect(v.watermark.detected).toBe(false);
  });
});

/**
 * Live integration — runs the REAL ContentAuth c2patool over genuine C2PA assets.
 * Skipped automatically when the binary isn't present (it's git-ignored; download
 * per services/provenance/README.md), exactly like the agent's G5/G6 tiers.
 */
describe.skipIf(!c2patoolAvailable())("C2paToolProvenanceAdapter (live — real c2patool)", () => {
  const adapter = new C2paToolProvenanceAdapter();

  it(`uses c2patool at ${resolveC2patoolBin()}`, () => {
    expect(c2patoolAvailable()).toBe(true);
  });

  it("verifies a genuine C2PA-signed AI image against the real tool", async () => {
    const v = await adapter.verify({ shot_id: "shot_real", asset_ref: fixture("signed-ai.jpg") });
    expect(v.detector).toBe("c2patool");
    expect(v.c2pa.present).toBe(true);
    expect(v.c2pa.integrity_ok).toBe(true);
    expect(v.c2pa.verified).toBe(true);
    expect(v.c2pa.ai_generated_signal).toBe(true); // digitalSourceType = algorithmicMedia
    expect(v.c2pa.signer).toBeTruthy();
  }, 20000);

  it("reports a plain image as carrying no manifest", async () => {
    const v = await adapter.verify({ shot_id: "shot_plain", asset_ref: fixture("no-manifest.jpg") });
    expect(v.c2pa.present).toBe(false);
    expect(v.c2pa.verified).toBe(false);
  }, 20000);
});
