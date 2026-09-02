import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Finding, Shot } from "@scenelock/schema";
import { computeVerdict, isBlocking, type VerdictInput } from "./index.js";

const TS = "2026-08-29T14:02:11.000Z";
const now = () => TS;

function lockableShot(id: string, index: number): Shot {
  return {
    shot_id: id,
    scene_id: "sc_12",
    index,
    status: "gates_complete",
    frame_count: 48,
    uris: { video: null, keyframes_prefix: null, audio: null },
    content_hash: `hash_${id}`,
    c2pa: { present: true, valid: true, manifest_uri: null },
    veo_job_id: `veo_${id}`,
    attempt_no: 0,
    gate_runs: [
      { gate: "continuity", sub_gate: null, shot_id: id, status: "completed", started_at: null, completed_at: null, duration_ms: 1200, model_versions: [], error: null },
      { gate: "clearance", sub_gate: null, shot_id: id, status: "completed", started_at: null, completed_at: null, duration_ms: 900, model_versions: [], error: null },
      { gate: "clearance", sub_gate: "audio", shot_id: id, status: "completed", started_at: null, completed_at: null, duration_ms: 700, model_versions: [], error: null },
    ],
  };
}

function finding(over: Partial<Finding>): Finding {
  return {
    finding_id: "f_1",
    scene_id: "sc_12",
    shot_id: "shot_1",
    frame: 14,
    gate: "continuity",
    sub_gate: null,
    stage: "shot",
    risk_class: "continuity.state",
    rule: "prop_state_mismatch",
    description: "x",
    recommendation: "",
    severity: "high",
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
    blocking: true,
    created_at: TS,
    schema_version: "2.1",
    ...over,
  };
}

const base = (over: Partial<VerdictInput>): VerdictInput => ({
  scene_id: "sc_12",
  tau: 0.7,
  config_version: "v3",
  shots: [lockableShot("shot_1", 0), lockableShot("shot_2", 1)],
  findings: [],
  now,
  ...over,
});

describe("computeVerdict — unit", () => {
  it("LOCKS a fully covered, clean scene", () => {
    const v = computeVerdict(base({}));
    expect(v.verdict).toBe("LOCKED");
    expect(v.reason).toBe("ok");
    expect(v.inputs.gate_coverage.label).toBe("6/6");
    expect(v.inputs.c2pa_coverage.label).toBe("2/2");
  });

  it("HOLDS on an unresolved blocking finding", () => {
    const v = computeVerdict(base({ findings: [finding({ status: "open" })] }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("open_blocking_findings");
    expect(v.inputs.blocking_open).toBe(1);
    expect(v.inputs.blocking_finding_ids).toEqual(["f_1"]);
  });

  it("still HOLDS while a blocking finding is in_remediation or escalated", () => {
    for (const status of ["in_remediation", "escalated"] as const) {
      const v = computeVerdict(base({ findings: [finding({ status })] }));
      expect(v.verdict, status).toBe("HELD");
      expect(v.reason, status).toBe("open_blocking_findings");
    }
  });

  it("LOCKS once the blocking finding is waived or resolved", () => {
    for (const status of ["waived", "resolved"] as const) {
      const v = computeVerdict(base({ findings: [finding({ status })] }));
      expect(v.verdict, status).toBe("LOCKED");
    }
  });

  it("preflight findings never block (E.4)", () => {
    const v = computeVerdict(
      base({ findings: [finding({ stage: "preflight", status: "open" })] }),
    );
    expect(v.verdict).toBe("LOCKED");
  });

  it("a high finding below τ does not block", () => {
    const v = computeVerdict(
      base({ tau: 0.9, findings: [finding({ confidence: 0.83, status: "open" })] }),
    );
    expect(v.verdict).toBe("LOCKED");
  });

  it("HOLDS with incomplete_gate_coverage when a gate run failed (G-02)", () => {
    const shots = [lockableShot("shot_1", 0), lockableShot("shot_2", 1)];
    shots[1]!.gate_runs[0]!.status = "failed";
    shots[1]!.gate_runs[0]!.error = "gemini timeout x3";
    const v = computeVerdict(base({ shots }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("incomplete_gate_coverage");
    expect(v.inputs.gate_coverage.label).toBe("5/6");
  });

  it("HOLDS with incomplete_gate_coverage when a required gate run is missing", () => {
    const shots = [lockableShot("shot_1", 0)];
    shots[0]!.gate_runs.pop(); // drop the audio sub-gate
    const v = computeVerdict(base({ shots }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("incomplete_gate_coverage");
  });

  it("HOLDS with incomplete_c2pa_coverage when a manifest is missing/invalid", () => {
    const shots = [lockableShot("shot_1", 0), lockableShot("shot_2", 1)];
    shots[1]!.c2pa = { present: true, valid: false, manifest_uri: null };
    const v = computeVerdict(base({ shots }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("incomplete_c2pa_coverage");
    expect(v.inputs.c2pa_coverage.label).toBe("1/2");
  });

  it("HOLDS with shots_not_ready when a shot is still regenerating", () => {
    const shots = [lockableShot("shot_1", 0), lockableShot("shot_2", 1)];
    shots[1]!.status = "regenerating";
    const v = computeVerdict(base({ shots }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("shots_not_ready");
  });

  it("HOLDS when the kill switch is engaged even if otherwise lockable", () => {
    const v = computeVerdict(base({ kill_switch: true }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("kill_switch_engaged");
  });

  it("HOLDS a scene with no shots", () => {
    const v = computeVerdict(base({ shots: [] }));
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("shots_not_ready");
  });

  it("ignores planned shots for coverage math", () => {
    const planned: Shot = { ...lockableShot("shot_3", 2), status: "planned", gate_runs: [], c2pa: null };
    const v = computeVerdict(base({ shots: [lockableShot("shot_1", 0), lockableShot("shot_2", 1), planned] }));
    expect(v.verdict).toBe("LOCKED");
    expect(v.inputs.shots_total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property tests (Part G): a scene can NEVER be LOCKED with an unresolved
// blocking finding or incomplete gate coverage. Fuzz over findings/coverage.
// ---------------------------------------------------------------------------

const arbStatus = fc.constantFrom(
  "open",
  "in_remediation",
  "resolved",
  "waived",
  "escalated",
) as fc.Arbitrary<Finding["status"]>;

const arbSeverity = fc.constantFrom("info", "low", "medium", "high") as fc.Arbitrary<
  Finding["severity"]
>;

const arbStage = fc.constantFrom("preflight", "shot") as fc.Arbitrary<Finding["stage"]>;

const arbFinding = fc
  .record({
    id: fc.integer({ min: 0, max: 9999 }),
    severity: arbSeverity,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    stage: arbStage,
    status: arbStatus,
  })
  .map(({ id, severity, confidence, stage, status }) =>
    finding({ finding_id: `f_${id}`, severity, confidence, stage, status }),
  );

const arbShot = fc
  .record({
    id: fc.integer({ min: 0, max: 999 }),
    dropRuns: fc.subarray([0, 1, 2]),
    failRuns: fc.subarray([0, 1, 2]),
    c2paPresent: fc.boolean(),
    c2paValid: fc.boolean(),
    status: fc.constantFrom(
      "gates_complete",
      "regenerating",
      "held",
      "ready",
      "failed_infra",
    ),
  })
  .map(({ id, dropRuns, failRuns, c2paPresent, c2paValid, status }) => {
    const s = lockableShot(`shot_${id}`, id);
    s.status = status as Shot["status"];
    s.c2pa = { present: c2paPresent, valid: c2paValid, manifest_uri: null };
    s.gate_runs = s.gate_runs
      .filter((_, i) => !dropRuns.includes(i))
      .map((r, i) => (failRuns.includes(i) ? { ...r, status: "failed" as const } : r));
    return s;
  });

const arbInput = fc
  .record({
    tau: fc.double({ min: 0, max: 1, noNaN: true }),
    shots: fc.array(arbShot, { minLength: 0, maxLength: 5 }),
    findings: fc.array(arbFinding, { maxLength: 8 }),
    kill: fc.boolean(),
  })
  .map(
    ({ tau, shots, findings, kill }): VerdictInput => ({
      scene_id: "sc_fuzz",
      tau,
      config_version: "vp",
      shots,
      findings,
      kill_switch: kill,
      now,
    }),
  );

describe("computeVerdict — properties", () => {
  it("LOCKED ⇒ no unresolved blocking finding", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const v = computeVerdict(input);
        if (v.verdict !== "LOCKED") return;
        const bad = input.findings.some(
          (f) =>
            isBlocking(f, input.tau) &&
            (f.status === "open" ||
              f.status === "in_remediation" ||
              f.status === "escalated"),
        );
        expect(bad).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });

  it("LOCKED ⇒ gate coverage complete and every shot c2pa-valid and gates_complete", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const v = computeVerdict(input);
        if (v.verdict !== "LOCKED") return;
        expect(v.inputs.gate_coverage.completed).toBe(v.inputs.gate_coverage.required);
        expect(v.inputs.gate_coverage.required).toBeGreaterThan(0);
        expect(v.inputs.c2pa_coverage.valid).toBe(v.inputs.c2pa_coverage.shots);
        for (const s of input.shots.filter((x) => x.status !== "planned")) {
          expect(["gates_complete", "locked"]).toContain(s.status);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("LOCKED ⇒ kill switch not engaged", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const v = computeVerdict(input);
        if (v.verdict === "LOCKED") expect(input.kill_switch).toBeFalsy();
      }),
      { numRuns: 500 },
    );
  });

  it("adding an unresolved blocking finding to any scene forces HELD", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const poisoned: VerdictInput = {
          ...input,
          tau: 0.5,
          findings: [
            ...input.findings,
            finding({ finding_id: "f_poison", severity: "high", confidence: 1, stage: "shot", status: "open" }),
          ],
        };
        expect(computeVerdict(poisoned).verdict).toBe("HELD");
      }),
      { numRuns: 1000 },
    );
  });

  it("verdict is deterministic for the same input", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        expect(computeVerdict(input)).toEqual(computeVerdict(input));
      }),
      { numRuns: 300 },
    );
  });
});
