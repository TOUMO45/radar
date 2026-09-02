import { describe, expect, it } from "vitest";
import {
  CertificatePayload,
  Directive,
  Entity,
  Finding,
  computeBlocking,
} from "./index.js";

/**
 * The literal examples from the design spec appendices must parse. If an
 * appendix and the Zod schema drift apart, this fails.
 */

describe("Appendix A — Finding v2", () => {
  const example = {
    finding_id: "f_9f2",
    scene_id: "sc_12",
    shot_id: "shot_4",
    frame: 14,
    gate: "continuity",
    sub_gate: null,
    stage: "shot",
    risk_class: "continuity.state",
    rule: "prop_state_mismatch",
    description:
      "The cola can appears unopened in frame 14; World State says it was opened in shot 3.",
    recommendation:
      "Regenerate with the can open and 2/3 empty; keep laptop and jacket unchanged.",
    severity: "high",
    confidence: 1.0,
    measurement: { metric: "state_match", value: 0, threshold: 1 },
    evidence_uri: "gs://radar-dev-org-x/evidence/f_9f2/frame_14.png",
    evidence_quote: null,
    status: "open",
    source: "deterministic",
    entity_id: "SC12-PROP-CAN-01",
    state_expected: "on_screen(open, 2/3)",
    state_observed: "on_screen(unopened)",
    remediation: { directive_id: "dir_12", attempts: 1, status: "running" },
    c2pa: null,
    adjudication: null,
    blocking: true,
    created_at: "2026-08-29T14:02:11Z",
    schema_version: "2.1",
  };

  it("parses", () => {
    const r = Finding.safeParse(example);
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.finding_id).toBe("f_9f2");
  });

  it("blocking predicate matches the spec formula", () => {
    expect(computeBlocking({ severity: "high", confidence: 1, stage: "shot", status: "open" }, 0.7)).toBe(true);
    expect(computeBlocking({ severity: "high", confidence: 0.6, stage: "shot", status: "open" }, 0.7)).toBe(false);
    expect(computeBlocking({ severity: "high", confidence: 1, stage: "preflight", status: "open" }, 0.7)).toBe(false);
    expect(computeBlocking({ severity: "high", confidence: 1, stage: "shot", status: "waived" }, 0.7)).toBe(false);
  });
});

describe("Appendix B — World State entity", () => {
  it("parses", () => {
    const r = Entity.safeParse({
      entity_id: "SC12-PROP-CAN-01",
      project_id: "project-42",
      type: "prop",
      canonical_desc: "red cola can, unopened, right of laptop",
      reference_uris: ["gs://x/references/SC12-PROP-CAN-01/ref_001.png"],
      embedding_ref: "vertex-ai-index/entity-42#881",
      embedding_model_version: "gemini-embed-001@2026-03",
      state_history: [
        { scene: "sc_12", shot: "shot_3", state: "introduced", evidence_uri: "gs://x/a.png", ts: "2026-08-29T14:00:00Z" },
      ],
      status: "active",
    });
    if (!r.success) throw new Error(r.error.message);
  });
});

describe("Appendix C — Regeneration directive", () => {
  it("parses", () => {
    const r = Directive.safeParse({
      directive_id: "dir_12",
      target_finding_id: "f_9f2",
      shot_id: "shot_4",
      prompt_patch: "Same shot; the cola can is open and 2/3 empty, standing right of the laptop.",
      reference_images: ["gs://x/references/SC12-PROP-CAN-01/ref_001.png"],
      invariants: ["jacket remains on chair back", "laptop position and screen content unchanged"],
      acceptance_criteria: ["continuity.state(f_9f2) resolves"],
      attempt_budget: 2,
      manual: false,
      created_at: "2026-08-29T14:05:00Z",
    });
    if (!r.success) throw new Error(r.error.message);
  });
});

describe("Appendix D — Clearance certificate payload", () => {
  it("parses with the verbatim disclaimer", () => {
    const r = CertificatePayload.safeParse({
      project: "project-42",
      scene: "sc_12",
      lock_timestamp: "2026-08-29T14:22:00Z",
      final_world_state: "snapshot-ref:gs://x/snapshots/sc_12.json",
      findings: ["f_9f2 (resolved via dir_12/attempt 2)", "f_a01 (waived — license #4417)"],
      evidence_chain: {
        frames: ["gs://x/evidence/a.png"],
        quotes: ["..."],
        embedding_versions: ["gemini-embed-001@2026-03"],
      },
      c2pa_manifests: ["gs://x/shots/shot_1/c2pa/manifest.json"],
      disclaimer: "Attests what was checked and what humans decided. Not a legal opinion.",
      schema_version: "2.1",
      prior_certificate_hash: "sha256:aaa",
      certificate_hash: "sha256:bbb",
      kms_key_version: "cert-chain-signer/3",
      verification_slug: "sc12-8f31",
    });
    if (!r.success) throw new Error(r.error.message);
  });
});
