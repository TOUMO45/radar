import type {
  Directive,
  Attempt,
  Entity,
  Finding,
  Production,
  Scene,
  Shot,
  StateEvent,
} from "@scenelock/schema";

/**
 * DRY_RUN demo spine — Act 1 (spec H.2, decision D11).
 *
 * Scene 12, 6 shots, reproducing:
 *   - jacket established then vanishes then reappears  (continuity.state, wardrobe)
 *   - cola can teleports across the desk               (continuity.state, prop) [BLOCKING]
 *   - the cola can is an uncleared real brand          (clearance.trademark)    [below τ]
 *   - dialogue names a sitting senator, no consent     (clearance.real_person)  [BLOCKING]
 *   - a Rolling-Stones-style lyric is sung             (clearance.lyrics/audio) [below τ]
 *   - one shot ships with no C2PA manifest             (clearance.ai_disclosure)[BLOCKING]
 *
 * Expected verdict on this seed: HELD · reason open_blocking_findings · 3 blocking.
 * No API keys, no cloud — this is also the console's MSW fixture.
 */

const T0 = "2026-08-29T13:55:00.000Z";
const T1 = "2026-08-29T14:02:11.000Z";

export const ORG_ID = "org_demo";
export const PRODUCTION_ID = "p_dry";
export const SCENE_ID = "sc_12";

export const production: Production = {
  production_id: PRODUCTION_ID,
  org_id: ORG_ID,
  title: "Neon Harbor — Ep. 1",
  mode: "dry_run",
  settings: {
    tau: 0.7,
    loop_budget: 2,
    cost_caps: {
      veo_seconds_cap: 900,
      gemini_token_cap: 4_000_000,
      loop_attempts_cap: 24,
      usd_cap: 250,
    },
    config_version: "v3",
  },
  spend: { veo_seconds: 128, gemini_tokens: 612_400, loop_attempts: 1, usd: 37.4 },
  kill_switch: false,
};

// --- World State (built first; gates check against it — spec §15) -------------

export const entities: Entity[] = [
  {
    entity_id: "SC12-PROP-CAN-01",
    project_id: PRODUCTION_ID,
    type: "prop",
    canonical_desc: "red cola can, unopened, right of the laptop",
    reference_uris: ["gs://radar-dev-org-org_demo/references/SC12-PROP-CAN-01/ref_001.png"],
    embedding_ref: "vertex-ai-index/entity-p_dry#881",
    embedding_model_version: "gemini-embed-001@2026-03",
    current_state: "on_screen",
    state_history: [
      { scene: SCENE_ID, shot: "shot_2", state: "introduced", evidence_uri: null, ts: T0 },
      { scene: SCENE_ID, shot: "shot_2", state: "on_screen", evidence_uri: null, ts: T0 },
    ],
    facts: ["can is unopened", "positioned right of the laptop", "label faces camera"],
    status: "active",
  },
  {
    entity_id: "SC12-WARD-JACKET-01",
    project_id: PRODUCTION_ID,
    type: "wardrobe",
    canonical_desc: "charcoal wool blazer, draped over the chair back",
    reference_uris: ["gs://radar-dev-org-org_demo/references/SC12-WARD-JACKET-01/ref_001.png"],
    embedding_ref: "vertex-ai-index/entity-p_dry#882",
    embedding_model_version: "gemini-embed-001@2026-03",
    current_state: "worn",
    state_history: [
      { scene: SCENE_ID, shot: "shot_1", state: "worn", evidence_uri: null, ts: T0 },
    ],
    facts: ["draped over chair back from shot 1", "single-breasted, notch lapel"],
    status: "active",
  },
  {
    entity_id: "SC12-CHAR-RIYA-01",
    project_id: PRODUCTION_ID,
    type: "character",
    canonical_desc: "Riya Kapoor — analyst, mid-30s, dark bob, wire-frame glasses",
    reference_uris: ["gs://radar-dev-org-org_demo/references/SC12-CHAR-RIYA-01/ref_001.png"],
    embedding_ref: "vertex-ai-index/entity-p_dry#883",
    embedding_model_version: "gemini-embed-001@2026-03",
    current_state: "identity_locked",
    state_history: [
      { scene: SCENE_ID, shot: "shot_1", state: "identity_locked", evidence_uri: null, ts: T0 },
    ],
    facts: ["identity anchor T_id = 0.82"],
    status: "active",
  },
  {
    entity_id: "SC12-LOC-BULLPEN-01",
    project_id: PRODUCTION_ID,
    type: "location",
    canonical_desc: "open-plan finance bullpen at night, monitors on, blinds half-drawn",
    reference_uris: ["gs://radar-dev-org-org_demo/references/SC12-LOC-BULLPEN-01/ref_001.png"],
    embedding_ref: "vertex-ai-index/entity-p_dry#884",
    embedding_model_version: "gemini-embed-001@2026-03",
    current_state: "established",
    state_history: [
      { scene: SCENE_ID, shot: "shot_1", state: "established", evidence_uri: null, ts: T0 },
    ],
    facts: ["night exterior through blinds", "overhead fluorescents at 60%"],
    status: "active",
  },
];

export const stateEvents: StateEvent[] = [
  { entity_id: "SC12-LOC-BULLPEN-01", from: null, to: "established", scene: SCENE_ID, shot: "shot_1", evidence_uri: null, actor: "gate-continuity", canonical: false, ts: T0 },
  { entity_id: "SC12-WARD-JACKET-01", from: null, to: "worn", scene: SCENE_ID, shot: "shot_1", evidence_uri: null, actor: "gate-continuity", canonical: false, ts: T0 },
  { entity_id: "SC12-CHAR-RIYA-01", from: null, to: "identity_locked", scene: SCENE_ID, shot: "shot_1", evidence_uri: null, actor: "gate-continuity", canonical: false, ts: T0 },
  { entity_id: "SC12-PROP-CAN-01", from: null, to: "introduced", scene: SCENE_ID, shot: "shot_2", evidence_uri: null, actor: "gate-continuity", canonical: false, ts: T0 },
  { entity_id: "SC12-PROP-CAN-01", from: "introduced", to: "on_screen", scene: SCENE_ID, shot: "shot_2", evidence_uri: null, actor: "gate-continuity", canonical: false, ts: T0 },
  { entity_id: "SC12-PROP-CAN-01", from: "on_screen", to: "moved", scene: SCENE_ID, shot: "shot_3", evidence_uri: "gs://radar-dev-org-org_demo/evidence/f_can_teleport/frame_09.png", actor: "gate-continuity", canonical: false, ts: T1 },
];

// --- Shots ------------------------------------------------------------------

function gateRuns(shotId: string, opts: { audioDur?: number } = {}): Shot["gate_runs"] {
  return [
    { gate: "continuity", sub_gate: null, shot_id: shotId, status: "completed", started_at: T0, completed_at: T1, duration_ms: 1180, model_versions: ["gemini-2.5-pro@2026-07", "gemini-embed-001@2026-03"], error: null },
    { gate: "clearance", sub_gate: null, shot_id: shotId, status: "completed", started_at: T0, completed_at: T1, duration_ms: 940, model_versions: ["gemini-2.5-pro@2026-07"], error: null },
    { gate: "clearance", sub_gate: "audio", shot_id: shotId, status: "completed", started_at: T0, completed_at: T1, duration_ms: opts.audioDur ?? 720, model_versions: ["whisper-lg-v3", "chromaprint@1.5"], error: null },
  ];
}

function shot(index: number, over: Partial<Shot> = {}): Shot {
  const id = `shot_${index}`;
  return {
    shot_id: id,
    scene_id: SCENE_ID,
    index: index - 1,
    status: "gates_complete",
    frame_count: 48,
    uris: {
      video: `gs://radar-dev-org-org_demo/productions/${PRODUCTION_ID}/shots/${id}/video.mp4`,
      keyframes_prefix: `gs://radar-dev-org-org_demo/productions/${PRODUCTION_ID}/shots/${id}/frames/`,
      audio: `gs://radar-dev-org-org_demo/productions/${PRODUCTION_ID}/shots/${id}/audio/16k_mono.wav`,
    },
    content_hash: `sha256:seed-${id}`,
    c2pa: { present: true, valid: true, manifest_uri: `gs://radar-dev-org-org_demo/productions/${PRODUCTION_ID}/shots/${id}/c2pa/manifest.json` },
    veo_job_id: `veo-job-${id}`,
    attempt_no: 0,
    gate_runs: gateRuns(id),
    ...over,
  };
}

export const shots: Shot[] = [
  shot(1),
  shot(2),
  shot(3),
  shot(4, { gate_runs: gateRuns("shot_4", { audioDur: 1510 }) }),
  shot(5),
  // shot 6 shipped with NO C2PA manifest — the undisclosed AI frame.
  shot(6, { c2pa: { present: false, valid: false, manifest_uri: null } }),
];

// --- Findings (one schema across every gate — spec §5) --------------------

function baseFinding(f: Partial<Finding> & Pick<Finding, "finding_id" | "shot_id" | "gate" | "risk_class" | "rule" | "description" | "severity" | "confidence" | "source" | "status">): Finding {
  return {
    scene_id: SCENE_ID,
    sub_gate: null,
    stage: "shot",
    frame: null,
    recommendation: "",
    measurement: null,
    evidence_uri: null,
    evidence_quote: null,
    entity_id: null,
    state_expected: null,
    state_observed: null,
    remediation: null,
    c2pa: null,
    adjudication: null,
    blocking: false,
    created_at: T1,
    schema_version: "2.1",
    ...f,
  };
}

export const findings: Finding[] = [
  // 1 — cola can teleports. Deterministic, conf 1.0 → BLOCKING.
  baseFinding({
    finding_id: "f_can_teleport",
    shot_id: "shot_3",
    frame: 9,
    gate: "continuity",
    risk_class: "continuity.state",
    rule: "prop_state_mismatch",
    description:
      "The cola can is left of the laptop in shot 3; World State places it right of the laptop (established shot 2).",
    recommendation:
      "Regenerate shot 3 with the can right of the laptop, unopened, label to camera. Keep laptop, chair and lighting unchanged.",
    severity: "high",
    confidence: 1.0,
    measurement: { metric: "state_match", value: 0, threshold: 1 },
    source: "deterministic",
    status: "open",
    entity_id: "SC12-PROP-CAN-01",
    state_expected: "on_screen(right_of_laptop)",
    state_observed: "on_screen(left_of_laptop)",
    evidence_uri: "gs://radar-dev-org-org_demo/evidence/f_can_teleport/frame_09.png",
    remediation: { directive_id: "dir_can_01", attempts: 1, status: "running" },
    blocking: true,
  }),
  // 2 — the cola can is an uncleared real brand. Hybrid, conf 0.62 < τ → NOT blocking.
  baseFinding({
    finding_id: "f_can_trademark",
    shot_id: "shot_3",
    frame: 9,
    gate: "clearance",
    risk_class: "trademark",
    rule: "unlicensed_trademark_near_match",
    description:
      "The cola can label is a near-match to a registered beverage trademark; no licensing record is attached to this production.",
    recommendation:
      "Replace with the cleared 'Vantage Cola' prop label, or attach a licensing record before lock.",
    severity: "high",
    confidence: 0.62,
    measurement: { metric: "logo_cosine", value: 0.62, threshold: 0.7 },
    source: "hybrid",
    status: "open",
    entity_id: "SC12-PROP-CAN-01",
    evidence_uri: "gs://radar-dev-org-org_demo/evidence/f_can_trademark/crop_09.png",
    evidence_quote: "OCR: \"C‑O‑?‑A  CLASSIC\"",
  }),
  // 3 — jacket vanished in shot 3. Medium → NOT blocking.
  baseFinding({
    finding_id: "f_jacket_missing",
    shot_id: "shot_3",
    frame: 2,
    gate: "continuity",
    risk_class: "continuity.presence",
    rule: "expected_entity_absent",
    description:
      "The charcoal blazer is absent from the chair back in shot 3; it is present in shots 1–2 and returns in shot 5.",
    recommendation: "Regenerate shot 3 with the blazer draped over the chair back as in shot 2.",
    severity: "medium",
    confidence: 0.9,
    measurement: { metric: "presence", value: 0, threshold: 1 },
    source: "hybrid",
    status: "open",
    entity_id: "SC12-WARD-JACKET-01",
    state_expected: "worn(on_chair_back)",
    state_observed: "absent",
    evidence_uri: "gs://radar-dev-org-org_demo/evidence/f_jacket_missing/frame_02.png",
  }),
  // 4 — dialogue names a sitting senator, no consent. Deterministic, conf 1.0 → BLOCKING.
  baseFinding({
    finding_id: "f_real_person",
    shot_id: "shot_4",
    gate: "clearance",
    risk_class: "real_person",
    rule: "named_public_figure_without_consent",
    description:
      "Dialogue names a sitting U.S. senator in a fictional corruption context. No Consent Registry record covers this reference.",
    recommendation:
      "Replace the name with the cleared fictional 'Senator Alvarez', or obtain a release and file it in the Consent Registry.",
    severity: "high",
    confidence: 1.0,
    measurement: { metric: "consent_record_match", value: 0, threshold: 1 },
    source: "deterministic",
    status: "open",
    evidence_quote:
      "RIYA: \"You think <REDACTED_SENATOR_NAME> signed off on the Halvorsen account for free?\"",
    blocking: true,
  }),
  // 5 — Rolling-Stones-style lyric sung. Hybrid/audio, conf 0.66 < τ → NOT blocking.
  baseFinding({
    finding_id: "f_lyric_audio",
    shot_id: "shot_4",
    gate: "clearance",
    sub_gate: "audio",
    risk_class: "lyrics",
    rule: "reference_lyric_window_match",
    description:
      "The hummed bridge in shot 4 matches an 8-gram window of a production-supplied reference lyric ('Gimme Shelter' style cue).",
    recommendation:
      "Swap for the cleared library cue 'Low Tide', or license the referenced track.",
    severity: "high",
    confidence: 0.66,
    measurement: { metric: "lyric_8gram_match", value: 0.66, threshold: 0.75 },
    source: "hybrid",
    status: "open",
    evidence_uri: "gs://radar-dev-org-org_demo/productions/p_dry/shots/shot_4/audio/16k_mono.wav",
    evidence_quote: "ASR: \"...oh, a storm is threatening my very life today...\"",
  }),
  // 6 — identity drift on Riya in shot 5. Medium → NOT blocking.
  baseFinding({
    finding_id: "f_identity_drift",
    shot_id: "shot_5",
    frame: 21,
    gate: "continuity",
    risk_class: "continuity.identity",
    rule: "identity_embedding_below_threshold",
    description:
      "Riya's face embedding in shot 5 sits just below the identity anchor threshold (possible variant).",
    recommendation: "Regenerate shot 5 conditioning on the Riya reference set; verify glasses frame and hairline.",
    severity: "medium",
    confidence: 0.71,
    measurement: { metric: "cosine", value: 0.79, threshold: 0.82 },
    source: "hybrid",
    status: "open",
    entity_id: "SC12-CHAR-RIYA-01",
    evidence_uri: "gs://radar-dev-org-org_demo/evidence/f_identity_drift/frame_21.png",
  }),
  // 7 — shot 6 has no C2PA manifest. Deterministic, conf 1.0 → BLOCKING.
  baseFinding({
    finding_id: "f_ai_disclosure",
    shot_id: "shot_6",
    gate: "clearance",
    risk_class: "ai_disclosure",
    rule: "c2pa_manifest_absent",
    description:
      "Shot 6 has no C2PA manifest. Provenance and AI-generation disclosure cannot be verified for this shot.",
    recommendation:
      "Re-export shot 6 through the Veo pipeline so a signed C2PA manifest is embedded, then re-run clearance.",
    severity: "high",
    confidence: 1.0,
    measurement: { metric: "c2pa_present", value: 0, threshold: 1 },
    source: "deterministic",
    status: "open",
    c2pa: { present: false, valid: false, manifest_uri: null },
    blocking: true,
  }),
  // 8 — pre-flight warning (never blocks — E.4). Surfaced before generation.
  baseFinding({
    finding_id: "f_preflight_lyric",
    shot_id: "shot_4",
    stage: "preflight",
    gate: "clearance",
    risk_class: "lyrics",
    rule: "script_quotes_probable_copyrighted_lyric",
    description:
      "Pre-flight: scene 12 dialogue direction reads 'hums a few bars of Gimme Shelter'. Likely needs a sync license or a swap.",
    recommendation: "Resolve before generation to avoid spending Veo budget on a shot that will be held.",
    severity: "medium",
    confidence: 0.8,
    source: "model",
    status: "open",
    evidence_quote: "SLUG: \"Riya hums a few bars of Gimme Shelter under her breath.\"",
  }),
];

// --- Loop artefacts (Appendix C) -----------------------------------------

export const directives: Directive[] = [
  {
    directive_id: "dir_can_01",
    target_finding_id: "f_can_teleport",
    shot_id: "shot_3",
    prompt_patch:
      "Same shot; the red cola can is unopened and positioned to the RIGHT of the laptop, label facing camera.",
    reference_images: [
      "gs://radar-dev-org-org_demo/references/SC12-PROP-CAN-01/ref_001.png",
    ],
    invariants: [
      "charcoal blazer remains draped over the chair back",
      "laptop position and screen content unchanged",
      "lighting and camera framing unchanged",
    ],
    acceptance_criteria: [
      "continuity.state(f_can_teleport) resolves",
      "no new blocking findings on re-run of both gates",
      "c2pa.valid = true for the regenerated shot",
    ],
    attempt_budget: 2,
    manual: false,
    created_at: T1,
  },
];

export const attempts: Attempt[] = [
  {
    attempt_no: 1,
    directive_id: "dir_can_01",
    shot_id: "shot_3",
    state: "verifying",
    cost: { veo_seconds: 8, gemini_tokens: 42_100, usd: 2.9 },
    latency_ms: 41_200,
    outcome: null,
    manual: false,
    created_at: T1,
  },
];

export const scene: Scene = {
  scene_id: SCENE_ID,
  production_id: PRODUCTION_ID,
  index: 12,
  heading: "INT. FINANCE BULLPEN – NIGHT",
  status: "held",
  verdict: null, // computed live by services/api via @scenelock/verdict
};
