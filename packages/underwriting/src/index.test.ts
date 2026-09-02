import { describe, expect, it } from "vitest";
import type {
  Certificate,
  ComplianceProfile,
  ConsentRecord,
  DeliveryReadiness,
  Finding,
  Production,
  ShotProvenance,
  TrustScore,
} from "@scenelock/schema";
import { UnderwritingPack } from "@scenelock/schema";
import {
  assembleUnderwritingPack,
  renderUnderwritingMarkdown,
  type UnderwritingInput,
} from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";

const production: Production = {
  production_id: "p_dry",
  org_id: "org_demo",
  title: "Neon Harbor",
  mode: "dry_run",
  settings: { tau: 0.7, loop_budget: 2, cost_caps: { veo_seconds_cap: 100, gemini_token_cap: 1000, loop_attempts_cap: 24 }, config_version: "v1" },
  spend: { veo_seconds: 0, gemini_tokens: 0, loop_attempts: 0, usd: 0 },
  kill_switch: false,
};

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

function finding(over: Partial<Finding> & Pick<Finding, "finding_id" | "risk_class" | "severity">): Finding {
  return {
    scene_id: "sc_12",
    shot_id: "shot_1",
    frame: null,
    gate: "clearance",
    sub_gate: null,
    stage: "shot",
    rule: "r",
    description: "desc",
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

const trust: TrustScore = {
  scene_id: "sc_12",
  score: 21,
  band: "red",
  breakdown: [],
  headline: "Held — 2 blocking legal/clearance issues to resolve",
  computed_at: NOW,
};

function delivery(ready: boolean): DeliveryReadiness {
  return {
    scene_id: "sc_12",
    ready,
    targets: [
      { kind: "jurisdiction", id: "EU", label: "European Union (AI Act)", ready, blocking_finding_ids: [], blocking_rule_ids: [], notes: [], max_severity: null },
      { kind: "jurisdiction", id: "GLOBAL", label: "Global baseline", ready: true, blocking_finding_ids: [], blocking_rule_ids: [], notes: [], max_severity: null },
    ],
    computed_at: NOW,
  };
}

const profile: ComplianceProfile = { production_id: "p_dry", territories: ["GLOBAL", "EU"], platforms: ["svod"] };

function baseInput(over: Partial<UnderwritingInput> = {}): UnderwritingInput {
  return {
    scene_id: "sc_12",
    production,
    profile,
    provenance: [prov()],
    consentRecords: [],
    findings: [],
    trust,
    delivery: delivery(true),
    certificate: null,
    pack_id: "uwp_test",
    now: NOW,
    ...over,
  };
}

describe("assembleUnderwritingPack", () => {
  it("validates against the schema", () => {
    const pack = assembleUnderwritingPack(baseInput());
    expect(() => UnderwritingPack.parse(pack)).not.toThrow();
  });

  it("a clean, certified scene is bindable with no gaps", () => {
    const cert = { slug: "sc12-ab12", certificate_id: "cert_1", payload: { certificate_hash: "abc", kms_key_version: "k/1", lock_timestamp: NOW } } as unknown as Certificate;
    const pack = assembleUnderwritingPack(baseInput({ certificate: cert }));
    expect(pack.bindable).toBe(true);
    expect(pack.blocking_gaps).toHaveLength(0);
    expect(pack.certificate.present).toBe(true);
    expect(pack.certificate.verify_path).toBe("/verify/sc12-ab12");
  });

  it("an unlabelled deceased-replica shot with no consent produces the exact binding gaps", () => {
    const p = prov({
      shot_id: "shot_4",
      is_deepfake: true,
      depicts_real_person: true,
      replica_kind: "deceased_performer",
      subject_name: "Vivian Marsh",
      c2pa: { present: false, valid: false, manifest_uri: null },
      watermark: { present: false, method: "none", detectable: false },
      perceptible_label: { present: false },
    });
    const pack = assembleUnderwritingPack(baseInput({ provenance: [p], certificate: null }));

    expect(pack.bindable).toBe(false);
    const failing = pack.checklist.filter((c) => c.status === "fail").map((c) => c.id);
    expect(failing).toContain("ai_disclosure_per_shot");
    expect(failing).toContain("deepfake_perceptible_label");
    expect(failing).toContain("digital_replica_consent");
    expect(failing).toContain("signed_certificate");

    const shot = pack.shot_disclosures[0]!;
    expect(shot.documented).toBe(false);
    expect(shot.gaps.length).toBeGreaterThanOrEqual(3);
  });

  it("an active consent record clears the replica-consent check", () => {
    const p = prov({ shot_id: "shot_4", replica_kind: "living_performer", subject_name: "Riya Kapoor" });
    const consent: ConsentRecord = {
      record_id: "cr_1",
      production_id: "p_dry",
      subject: "Riya Kapoor",
      kind: "release",
      linked_entity_id: null,
      linked_figure_node_id: null,
      doc_uri: null,
      expiry: null,
      status: "active",
      redaction_status: "clean",
      uploaded_by: "producer",
      created_at: NOW,
    };
    const pack = assembleUnderwritingPack(baseInput({ provenance: [p], consentRecords: [consent] }));
    const check = pack.checklist.find((c) => c.id === "digital_replica_consent")!;
    expect(check.status).toBe("pass");
    expect(pack.shot_disclosures[0]!.consent_on_file).toBe(true);
  });

  it("captures the waiver trail for adjudicated findings", () => {
    const waived = finding({
      finding_id: "f_cl_shot_1_trademark",
      risk_class: "trademark",
      severity: "high",
      status: "waived",
      adjudication: { adjudication_id: "adj_1", finding_id: "f_cl_shot_1_trademark", by: "legal_head", decision: "waive", reason: "fair-use parody, counsel-approved", at: NOW },
    });
    const pack = assembleUnderwritingPack(baseInput({ findings: [waived] }));
    const row = pack.findings_ledger.find((f) => f.finding_id === "f_cl_shot_1_trademark")!;
    expect(row.disposition).toContain("waived by legal_head");
    // waived (not open) → does not block binding
    expect(pack.checklist.find((c) => c.id === "no_open_blocking_findings")!.status).toBe("pass");
  });

  it("an open blocking finding fails the findings check and blocks binding", () => {
    const open = finding({ finding_id: "f_open", risk_class: "real_person", severity: "high", status: "open", blocking: true });
    const pack = assembleUnderwritingPack(baseInput({ findings: [open] }));
    expect(pack.checklist.find((c) => c.id === "no_open_blocking_findings")!.status).toBe("fail");
    expect(pack.bindable).toBe(false);
  });
});

describe("renderUnderwritingMarkdown", () => {
  it("renders the binder with all sections and the disclaimer", () => {
    const cert = { slug: "sc12-ab12", certificate_id: "cert_1", payload: { certificate_hash: "abc", kms_key_version: "k/1", lock_timestamp: NOW } } as unknown as Certificate;
    const md = renderUnderwritingMarkdown(assembleUnderwritingPack(baseInput({ certificate: cert })));
    expect(md).toContain("# E&O / Underwriting Pack — Neon Harbor");
    expect(md).toContain("## 1. Underwriter checklist");
    expect(md).toContain("## 2. Per-shot AI-disclosure schedule");
    expect(md).toContain("## 5. Signed certificate");
    expect(md).toContain("Radar is a compliance radar, not a lawyer");
  });
});
