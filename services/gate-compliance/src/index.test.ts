import { describe, expect, it } from "vitest";
import type { ComplianceProfile, ConsentRecord, ShotProvenance } from "@scenelock/schema";
import { GateCompliance } from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";
const gate = new GateCompliance();

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

const profile: ComplianceProfile = {
  production_id: "p_dry",
  territories: ["GLOBAL", "EU", "US_CA", "US_NY"],
  platforms: ["svod", "youtube", "tiktok"],
};

function run(provenance: ShotProvenance[], consent: ConsentRecord[] = [], tau = 0.7) {
  return gate.run({ scene_id: "sc_12", provenance, profile, consentRecords: consent, tau, now: NOW });
}

describe("GateCompliance — Finding emission", () => {
  it("a deceased-replica shot without consent yields a blocking likeness_rights finding (AB 1836)", () => {
    const rep = run([
      prov({
        shot_id: "shot_4",
        is_deepfake: true,
        depicts_real_person: true,
        replica_kind: "deceased_performer",
        subject_name: "Vivian Marsh",
      }),
    ]);
    const ab1836 = rep.findings.find((f) => f.rule === "ca_ab1836_deceased_replica_no_consent");
    expect(ab1836).toBeDefined();
    expect(ab1836!.gate).toBe("clearance");
    expect(ab1836!.risk_class).toBe("likeness_rights");
    expect(ab1836!.severity).toBe("high");
    expect(ab1836!.confidence).toBe(1.0);
    expect(ab1836!.blocking).toBe(true); // high + conf 1.0 ≥ τ + stage shot
    expect(ab1836!.description).toContain("AB 1836");
  });

  it("an active estate consent for the subject clears AB 1836", () => {
    const consent: ConsentRecord[] = [
      {
        record_id: "c1",
        production_id: "p_dry",
        subject: "Vivian Marsh",
        kind: "release",
        linked_entity_id: null,
        linked_figure_node_id: null,
        doc_uri: null,
        expiry: null,
        status: "active",
        redaction_status: "clean",
        uploaded_by: "u_legal",
        created_at: NOW,
      },
    ];
    const rep = run(
      [prov({ shot_id: "shot_4", replica_kind: "deceased_performer", subject_name: "Vivian Marsh" })],
      consent,
    );
    expect(rep.findings.find((f) => f.rule === "ca_ab1836_deceased_replica_no_consent")).toBeUndefined();
  });

  it("EU 50(2) marking-missing is blocking when the watermark isn't detectable", () => {
    const rep = run([
      prov({ shot_id: "shot_6", c2pa: { present: false, valid: false, manifest_uri: null }, watermark: { present: false, method: "none", detectable: false } }),
    ]);
    const eu = rep.findings.find((f) => f.rule === "eu_art50_2_marking_missing");
    expect(eu?.blocking).toBe(true);
    expect(rep.failing_targets).toContain("EU");
  });

  it("a fully compliant scene yields zero findings", () => {
    const clean = prov({
      shot_id: "shot_ok",
      is_deepfake: true,
      depicts_real_person: true,
      replica_kind: "living_performer",
      subject_name: "A. Consented",
      perceptible_label: { present: true },
    });
    const consent: ConsentRecord[] = [
      {
        record_id: "c2",
        production_id: "p_dry",
        subject: "A. Consented",
        kind: "release",
        linked_entity_id: null,
        linked_figure_node_id: null,
        doc_uri: null,
        expiry: null,
        status: "active",
        redaction_status: "clean",
        uploaded_by: "u_legal",
        created_at: NOW,
      },
    ];
    const rep = run([clean], consent);
    expect(rep.findings).toHaveLength(0);
    expect(rep.failing_targets).toHaveLength(0);
  });

  it("groups findings by shot and is deterministic", () => {
    const input = [
      prov({ shot_id: "shot_4", is_deepfake: true, depicts_real_person: true, replica_kind: "deceased_performer", subject_name: "Vivian Marsh" }),
      prov({ shot_id: "shot_6", c2pa: null, watermark: { present: false, method: "none", detectable: false } }),
    ];
    const a = run(input);
    const b = run(input);
    expect(a.findings.map((f) => f.finding_id)).toEqual(b.findings.map((f) => f.finding_id));
    expect(Object.keys(a.by_shot).sort()).toEqual(["shot_4", "shot_6"]);
  });

  it("platform findings (medium) are not blocking but are reported", () => {
    const rep = run([
      prov({ shot_id: "shot_4", is_deepfake: true, depicts_real_person: true, replica_kind: "none", c2pa: null, perceptible_label: { present: false } }),
    ]);
    const tiktok = rep.findings.find((f) => f.rule === "tiktok_aigc_label_missing");
    expect(tiktok).toBeDefined();
    expect(tiktok!.blocking).toBe(false);
  });
});
