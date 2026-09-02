import { describe, expect, it } from "vitest";
import { Finding, Entity, Shot, Directive } from "@scenelock/schema";
import { computeVerdict } from "@scenelock/verdict";
import { getDryRunStore } from "./index.js";

describe("DRY_RUN demo spine", () => {
  const store = getDryRunStore();

  it("every seeded finding validates against Finding v2", () => {
    for (const f of store.findings) {
      const r = Finding.safeParse(f);
      if (!r.success) throw new Error(`${f.finding_id}: ${r.error.message}`);
    }
  });

  it("every seeded entity / shot / directive validates against the contract", () => {
    for (const e of store.entities) expect(Entity.safeParse(e).success).toBe(true);
    for (const s of store.shots) expect(Shot.safeParse(s).success).toBe(true);
    for (const d of store.directives) expect(Directive.safeParse(d).success).toBe(true);
  });

  it("computes HELD with exactly 3 blocking findings (matches spec H.2 / War Room mock)", () => {
    const v = computeVerdict({
      scene_id: store.scene.scene_id,
      tau: store.production.settings.tau,
      config_version: store.production.settings.config_version,
      kill_switch: store.production.kill_switch,
      shots: store.shots,
      findings: store.findings,
      now: () => "2026-08-29T14:02:11.000Z",
    });
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("open_blocking_findings");
    expect(v.inputs.blocking_open).toBe(3);
    expect(new Set(v.inputs.blocking_finding_ids)).toEqual(
      new Set(["f_can_teleport", "f_real_person", "f_ai_disclosure"]),
    );
    expect(v.inputs.c2pa_coverage.label).toBe("5/6");
    expect(v.inputs.gate_coverage.completed).toBe(v.inputs.gate_coverage.required);
  });

  it("preflight findings are present but never counted as blocking", () => {
    const pf = store.findings.filter((f) => f.stage === "preflight");
    expect(pf.length).toBeGreaterThan(0);
    expect(pf.every((f) => f.blocking === false)).toBe(true);
  });

  it("locks once the 3 blocking findings are waived/resolved", () => {
    const patched = store.findings.map((f) =>
      ["f_can_teleport", "f_real_person", "f_ai_disclosure"].includes(f.finding_id)
        ? { ...f, status: "waived" as const }
        : f,
    );
    // also heal the C2PA gap the ai_disclosure finding stood for
    const shots = store.shots.map((s) =>
      s.shot_id === "shot_6"
        ? { ...s, c2pa: { present: true, valid: true, manifest_uri: null } }
        : s,
    );
    const v = computeVerdict({
      scene_id: store.scene.scene_id,
      tau: store.production.settings.tau,
      config_version: store.production.settings.config_version,
      shots,
      findings: patched,
      now: () => "2026-08-29T14:30:00.000Z",
    });
    expect(v.verdict).toBe("LOCKED");
  });
});
