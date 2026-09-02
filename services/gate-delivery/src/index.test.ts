import { describe, expect, it } from "vitest";
import type { ComplianceProfile, TechnicalMaster } from "@scenelock/schema";
import { checkMaster, gateDelivery } from "./index.js";
import { DELIVERY_SPECS } from "@scenelock/schema";

const NOW = "2026-09-02T00:00:00.000Z";

function master(over: Partial<TechnicalMaster> = {}): TechnicalMaster {
  return {
    scene_id: "sc_12",
    width: 3840,
    height: 2160,
    fps: 24,
    color_space: "rec709",
    bit_depth: 10,
    codec: "prores",
    container: "mov",
    loudness_lkfs: -27,
    true_peak_dbtp: -2,
    has_captions: true,
    caption_format: "imsc1",
    hdr: false,
    ...over,
  };
}
const profile = (platforms: ComplianceProfile["platforms"]): ComplianceProfile => ({
  production_id: "p_dry",
  territories: ["GLOBAL"],
  platforms,
});

describe("gate-delivery — checkMaster", () => {
  it("a compliant master passes the SVOD spec with zero failures", () => {
    const checks = checkMaster(master(), DELIVERY_SPECS.svod!);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("catches loudness off-target, missing captions and wrong fps", () => {
    const checks = checkMaster(
      master({ loudness_lkfs: -30, has_captions: false, fps: 30 }),
      DELIVERY_SPECS.svod!,
    );
    const failed = checks.filter((c) => !c.ok).map((c) => c.param).sort();
    expect(failed).toContain("loudness");
    expect(failed).toContain("captions");
    expect(failed).toContain("frame_rate");
  });

  it("broadcast EBU R128 is stricter on loudness (-23 +/-1) than SVOD", () => {
    // -27 passes SVOD but fails EBU R128
    const ebu = checkMaster(master({ loudness_lkfs: -27 }), DELIVERY_SPECS.broadcast_tv!);
    expect(ebu.find((c) => c.param === "loudness")!.ok).toBe(false);
  });

  it("theatrical DCP demands XYZ colour and JPEG2000", () => {
    const dcp = checkMaster(master({ color_space: "rec709", codec: "prores", fps: 24, bit_depth: 12, width: 4096, height: 2160 }), DELIVERY_SPECS.theatrical!);
    const failed = dcp.filter((c) => !c.ok).map((c) => c.param);
    expect(failed).toContain("color_space");
    expect(failed).toContain("codec");
  });
});

describe("gate-delivery — GateDelivery.run", () => {
  it("emits deterministic findings per failed check, only for targeted platforms with a spec", () => {
    const bad = master({ loudness_lkfs: -30, has_captions: false });
    const out = gateDelivery.run({ scene_id: "sc_12", master: bad, profile: profile(["svod", "tiktok"]), tau: 0.7, now: NOW });
    // tiktok has no encoded technical spec → no target
    expect(out.report.targets.map((t) => t.platform)).toEqual(["svod"]);
    expect(out.report.passed).toBe(false);
    const ids = out.findings.map((f) => f.finding_id);
    expect(ids).toContain("f_del_sc_12_svod_loudness");
    expect(ids).toContain("f_del_sc_12_svod_captions");
    for (const f of out.findings) {
      expect(f.gate).toBe("delivery");
      expect(f.risk_class).toBe("technical_delivery");
      expect(f.confidence).toBe(1);
    }
    // high-severity checks are blocking at tau 0.7
    expect(out.findings.find((f) => f.finding_id === "f_del_sc_12_svod_loudness")!.blocking).toBe(true);
  });

  it("an SVOD-tuned master passes SVOD cleanly", () => {
    const out = gateDelivery.run({ scene_id: "sc_12", master: master(), profile: profile(["svod"]), tau: 0.7, now: NOW });
    expect(out.report.passed).toBe(true);
    expect(out.findings).toHaveLength(0);
  });

  it("the SAME master fails YouTube on loudness (-27 vs -14 target) — specs really differ", () => {
    const out = gateDelivery.run({ scene_id: "sc_12", master: master(), profile: profile(["youtube"]), tau: 0.7, now: NOW });
    expect(out.findings.map((f) => f.finding_id)).toContain("f_del_sc_12_youtube_loudness");
  });

  it("no master → no targets, passes vacuously", () => {
    const out = gateDelivery.run({ scene_id: "sc_12", master: null, profile: profile(["svod"]), tau: 0.7, now: NOW });
    expect(out.report.passed).toBe(true);
    expect(out.findings).toHaveLength(0);
  });
});
