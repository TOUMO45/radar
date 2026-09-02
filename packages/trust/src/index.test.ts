import { describe, expect, it } from "vitest";
import type { ComplianceProfile, Finding, ShotProvenance } from "@scenelock/schema";
import type { RuleViolation } from "@scenelock/rulepack";
import { RULES } from "@scenelock/rulepack";
import { computeDeliveryReadiness, computeTrustScore } from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";

function finding(over: Partial<Finding> & Pick<Finding, "finding_id" | "risk_class" | "severity">): Finding {
  return {
    scene_id: "sc_12",
    shot_id: "shot_1",
    frame: null,
    gate: "clearance",
    sub_gate: null,
    stage: "shot",
    rule: "r",
    description: "",
    recommendation: "",
    confidence: 1,
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
    blocking: over.severity === "high",
    created_at: NOW,
    schema_version: "2.1",
    ...over,
  };
}

function prov(over: Partial<ShotProvenance> = {}): ShotProvenance {
  return {
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
    ...over,
  };
}

describe("computeTrustScore", () => {
  it("a clean, fully-marked scene scores green 100", () => {
    const ts = computeTrustScore({ scene_id: "sc_12", provenance: [prov(), prov({ shot_id: "shot_2" })], findings: [], now: NOW });
    expect(ts.score).toBe(100);
    expect(ts.band).toBe("green");
  });

  it("open high compliance findings drag the score into red and headline names them", () => {
    const findings = [
      finding({ finding_id: "f1", risk_class: "likeness_rights", severity: "high" }),
      finding({ finding_id: "f2", risk_class: "deepfake_disclosure", severity: "high" }),
    ];
    const ts = computeTrustScore({ scene_id: "sc_12", provenance: [prov()], findings, now: NOW });
    expect(ts.band).toBe("red");
    expect(ts.headline).toContain("blocking");
    const compliance = ts.breakdown.find((d) => d.key === "compliance")!;
    expect(compliance.score).toBeLessThan(20);
    expect(compliance.weight).toBe(0.35);
  });

  it("provenance dimension reflects marked-shot coverage", () => {
    const ts = computeTrustScore({
      scene_id: "sc_12",
      provenance: [
        prov({ shot_id: "a" }),
        prov({ shot_id: "b", c2pa: { present: false, valid: false, manifest_uri: null }, watermark: { present: false, method: "none", detectable: false } }),
      ],
      findings: [],
      now: NOW,
    });
    const dim = ts.breakdown.find((d) => d.key === "provenance")!;
    expect(dim.score).toBe(50);
  });

  it("waived/resolved findings do not count against the score", () => {
    const ts = computeTrustScore({
      scene_id: "sc_12",
      provenance: [prov()],
      findings: [finding({ finding_id: "f1", risk_class: "likeness_rights", severity: "high", status: "waived" })],
      now: NOW,
    });
    expect(ts.score).toBe(100);
  });

  it("dimension weights sum to 1", () => {
    const ts = computeTrustScore({ scene_id: "sc_12", provenance: [prov()], findings: [], now: NOW });
    const total = ts.breakdown.reduce((a, d) => a + d.weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });
});

describe("computeDeliveryReadiness", () => {
  const profile: ComplianceProfile = {
    production_id: "p_dry",
    territories: ["EU", "US_CA"],
    platforms: ["youtube"],
  };

  function violation(ruleId: string, shot: string, inForce: string): RuleViolation {
    const rule = RULES.find((r) => r.id === ruleId)!;
    return { rule, shot_id: shot, in_force_by: inForce };
  }

  it("a high EU violation makes EU not-ready but leaves other targets ready", () => {
    const dr = computeDeliveryReadiness({
      scene_id: "sc_12",
      profile,
      violations: [violation("eu_ai_act_art50_2_machine_readable", "shot_6", "EU")],
      now: NOW,
    });
    expect(dr.ready).toBe(false);
    const eu = dr.targets.find((t) => t.id === "EU")!;
    expect(eu.ready).toBe(false);
    expect(eu.blocking_rule_ids).toContain("eu_ai_act_art50_2_machine_readable");
    const ca = dr.targets.find((t) => t.id === "US_CA")!;
    expect(ca.ready).toBe(true);
  });

  it("medium platform violations are notes, not blockers — target stays ready", () => {
    const dr = computeDeliveryReadiness({
      scene_id: "sc_12",
      profile,
      violations: [violation("youtube_altered_synthetic_disclosure", "shot_4", "youtube")],
      now: NOW,
    });
    const yt = dr.targets.find((t) => t.id === "youtube")!;
    expect(yt.ready).toBe(true);
    expect(yt.notes.length).toBe(1);
    expect(yt.max_severity).toBe("medium");
  });

  it("no violations → every target ready and always includes the GLOBAL baseline", () => {
    const dr = computeDeliveryReadiness({ scene_id: "sc_12", profile, violations: [], now: NOW });
    expect(dr.ready).toBe(true);
    expect(dr.targets.some((t) => t.id === "GLOBAL")).toBe(true);
  });
});
