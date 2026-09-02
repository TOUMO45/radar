import type { Clock, EventBusPort, StoragePort } from "@scenelock/ports";
import {
  hasActiveConsent,
  type Finding,
  type GateRun,
  type KgBrand,
  type KgFigure,
  type KgSong,
  type MediaArtifacts,
  type Shot,
} from "@scenelock/schema";
import { editSimilarity, phrasePresent, windowMatch } from "./match.js";
import { TemplateExplainer, type Explainer } from "./explainer.js";

export { TemplateExplainer } from "./explainer.js";
export type { Explainer } from "./explainer.js";
export * from "./match.js";

/**
 * Calibrated *report* thresholds (E.5.2): below these the match is noise and no
 * finding is emitted. Whether an emitted finding is *blocking* is a separate
 * question the verdict service answers (confidence ≥ τ). Each threshold gets a
 * SceneBench fixture set in P6.
 */
export interface ClearanceThresholds {
  trademark: number; // label edit-similarity
  lyrics: number; // n-gram window match
}
export const DEFAULT_THRESHOLDS: ClearanceThresholds = { trademark: 0.55, lyrics: 0.55 };

const MODEL_VERSIONS = ["gemini-2.5-pro@2026-07", "template-explainer@1"];

/**
 * Modality calibration (E.5.2: "detection scored ... calibration from SceneBench").
 * The raw match ratio goes in `measurement.value`; the *detection confidence*
 * discounts it by how noisy that modality's front-end is (G-07 keeps the two
 * separate). OCR off a stylised in-frame label is noisier than an ASR transcript.
 */
const OCR_CALIBRATION = 0.8;
const ASR_CALIBRATION = 1.0;

export interface GateClearanceDeps {
  storage: StoragePort;
  clock: Clock;
  events?: EventBusPort;
  explainer?: Explainer;
  thresholds?: ClearanceThresholds;
}

export interface GateResult {
  shot_id: string;
  findings: Finding[];
  gate_runs: GateRun[];
}

type PushArgs = Pick<
  Finding,
  "risk_class" | "rule" | "severity" | "confidence" | "source" | "sub_gate"
> & {
  measurement?: Finding["measurement"];
  evidence_quote?: string | null;
  evidence_uri?: string | null;
  c2pa?: Finding["c2pa"];
  subject?: string;
};
type PushFn = (p: PushArgs) => void;

export class GateClearance {
  private explainer: Explainer;
  private th: ClearanceThresholds;

  constructor(private deps: GateClearanceDeps) {
    this.explainer = deps.explainer ?? new TemplateExplainer();
    this.th = deps.thresholds ?? DEFAULT_THRESHOLDS;
  }

  /** Run the clearance gate on one processed shot. */
  async runShot(shotId: string): Promise<GateResult> {
    const started_at = this.deps.clock.now();
    const shot = await this.deps.storage.getShot(shotId);
    if (!shot) throw new Error(`gate-clearance: unknown shot ${shotId}`);
    const media = await this.deps.storage.getMediaArtifacts(shotId);
    if (!media) throw new Error(`gate-clearance: shot ${shotId} not processed (run media-processor first)`);

    const scene = await this.deps.storage.getScene(shot.scene_id);
    const productionId = scene?.production_id ?? "";
    const dialogue = await this.deps.storage.getDialogue(shotId);
    const [brands, songs, figures, consent] = await Promise.all([
      this.deps.storage.listKg("brand") as Promise<KgBrand[]>,
      this.deps.storage.listKg("song") as Promise<KgSong[]>,
      this.deps.storage.listKg("figure") as Promise<KgFigure[]>,
      this.deps.storage.listConsentRecords(productionId),
    ]);

    const now = this.deps.clock.now();
    const findings: Finding[] = [];

    const push: PushFn = (partial) => {
      const ex = this.explainer.explain({
        risk_class: partial.risk_class,
        rule: partial.rule,
        shot_id: shotId,
        subject: partial.subject,
        measurement: partial.measurement ?? undefined,
        untrusted_evidence: partial.evidence_quote ?? null,
      });
      findings.push({
        finding_id: `f_cl_${shotId}_${partial.risk_class}`,
        scene_id: shot.scene_id,
        shot_id: shotId,
        frame: null,
        gate: "clearance",
        sub_gate: partial.sub_gate ?? null,
        stage: "shot",
        risk_class: partial.risk_class,
        rule: partial.rule,
        description: ex.description,
        recommendation: ex.recommendation,
        severity: partial.severity,
        confidence: partial.confidence,
        measurement: partial.measurement ?? null,
        evidence_uri: partial.evidence_uri ?? null,
        evidence_quote: partial.evidence_quote ?? null,
        status: "open",
        source: partial.source,
        entity_id: null,
        state_expected: null,
        state_observed: null,
        remediation: null,
        c2pa: partial.c2pa ?? null,
        adjudication: null,
        blocking: false, // precomputed by the backend on read (D5)
        created_at: now,
        schema_version: "2.1",
      });
    };

    // --- ai_disclosure (deterministic, confidence 1.0) ---------------
    this.checkAiDisclosure(shot, media, push);
    // --- real_person (deterministic, confidence 1.0) -----------------
    this.checkRealPerson(dialogue?.script ?? "", figures, consent, now, push);
    // --- trademark (hybrid) -----------------------------------------
    this.checkTrademark(dialogue?.ocr_label ?? "", brands, push);
    // --- lyrics (hybrid, audio sub-gate) --------------------------
    this.checkLyrics(`${dialogue?.script ?? ""} ${media.transcript}`, songs, push);

    const completed_at = this.deps.clock.now();
    const base = {
      shot_id: shotId,
      status: "completed" as const,
      started_at,
      completed_at,
      duration_ms: 900,
      model_versions: MODEL_VERSIONS,
      error: null,
    };
    const gate_runs: GateRun[] = [
      { gate: "clearance", sub_gate: null, ...base },
      { gate: "clearance", sub_gate: "audio", ...base, duration_ms: media.audio.duration_ms },
    ];

    // write gate_runs back onto the shot (replace prior clearance runs)
    const kept = shot.gate_runs.filter((r) => r.gate !== "clearance");
    await this.deps.storage.putShot({ ...shot, gate_runs: [...kept, ...gate_runs] });

    await this.deps.events?.publish(
      "gates.results",
      { shot_id: shotId, gate: "clearance", findings, gate_runs },
      { ordering_key: shotId },
    );
    for (const f of findings) this.deps.events?.emitSse({ type: "finding.created", data: f });

    return { shot_id: shotId, findings, gate_runs };
  }

  /** Subscribe to gates.requested (E.2). */
  subscribe(): () => void {
    if (!this.deps.events) return () => {};
    return this.deps.events.subscribe("gates.requested", async (e) => {
      const p = e.payload as { shot_id: string; gates?: string[] };
      if (p.gates && !p.gates.includes("clearance")) return;
      await this.runShot(p.shot_id);
    });
  }

  // ---- deterministic cores ------------------------------------------

  private checkAiDisclosure(
    shot: Shot,
    media: MediaArtifacts,
    push: PushFn,
  ) {
    const c = media.c2pa;
    if (!c.present) {
      push({
        risk_class: "ai_disclosure",
        rule: "c2pa_manifest_absent",
        severity: "high",
        confidence: 1.0,
        source: "deterministic",
        sub_gate: null,
        measurement: { metric: "c2pa_present", value: 0, threshold: 1 },
        c2pa: { present: false, valid: false, manifest_uri: null },
      });
      return;
    }
    if (!c.valid || !c.signer_chain_ok) {
      push({
        risk_class: "ai_disclosure",
        rule: "c2pa_manifest_invalid",
        severity: "high",
        confidence: 1.0,
        source: "deterministic",
        sub_gate: null,
        measurement: { metric: "c2pa_valid", value: 0, threshold: 1 },
        c2pa: { present: true, valid: false, manifest_uri: c.manifest_uri },
      });
      return;
    }
    if (c.generator !== (shot.veo_job_id ?? null)) {
      push({
        risk_class: "ai_disclosure",
        rule: "c2pa_generator_mismatch",
        severity: "high",
        confidence: 1.0,
        source: "deterministic",
        sub_gate: null,
        measurement: { metric: "generator_match", value: 0, threshold: 1 },
        evidence_quote: `manifest.generator=${c.generator ?? "null"} shot.veo_job_id=${shot.veo_job_id ?? "null"}`,
        c2pa: { present: true, valid: true, manifest_uri: c.manifest_uri },
      });
    }
  }

  private checkRealPerson(
    script: string,
    figures: KgFigure[],
    consent: Parameters<typeof hasActiveConsent>[0],
    now: string,
    push: PushFn,
  ) {
    for (const fig of figures) {
      const names = [fig.name, ...fig.aliases];
      const hit = names.find((n) => phrasePresent(script, n));
      if (!hit) continue;
      if (hasActiveConsent(consent, fig.name, now)) continue;
      push({
        risk_class: "real_person",
        rule: "named_public_figure_without_consent",
        severity: "high",
        confidence: 1.0,
        source: "deterministic",
        sub_gate: null,
        subject: fig.name,
        measurement: { metric: "consent_record_match", value: 0, threshold: 1 },
        evidence_quote: firstLineWith(script, hit),
      });
      return; // one finding per shot is enough to hold it
    }
  }

  private checkTrademark(ocrLabel: string, brands: KgBrand[], push: PushFn) {
    if (!ocrLabel.trim()) return;
    let best: { brand: KgBrand; score: number } | null = null;
    for (const brand of brands) {
      for (const label of brand.label_strings) {
        const s = editSimilarity(ocrLabel, label);
        if (!best || s > best.score) best = { brand, score: s };
      }
    }
    if (!best || best.score < this.th.trademark) return;
    push({
      risk_class: "trademark",
      rule: "unlicensed_trademark_near_match",
      severity: "high",
      confidence: round2(best.score * OCR_CALIBRATION),
      source: "hybrid",
      sub_gate: null,
      subject: best.brand.name,
      measurement: {
        metric: "label_edit_similarity",
        value: round2(best.score),
        threshold: this.th.trademark,
      },
      evidence_quote: `OCR: "${ocrLabel}"`,
    });
  }

  private checkLyrics(text: string, songs: KgSong[], push: PushFn) {
    let best: { song: KgSong; score: number; line: string } | null = null;
    for (const song of songs) {
      for (const line of song.reference_lyrics) {
        const s = windowMatch(text, line, 8);
        if (!best || s > best.score) best = { song, score: s, line };
      }
    }
    if (!best || best.score < this.th.lyrics) return;
    push({
      risk_class: "lyrics",
      rule: "reference_lyric_window_match",
      severity: "high",
      confidence: round2(best.score * ASR_CALIBRATION),
      source: "hybrid",
      sub_gate: "audio",
      subject: best.song.name,
      measurement: {
        metric: "lyric_8gram_match",
        value: round2(best.score),
        threshold: this.th.lyrics,
      },
      evidence_quote: `ASR/script: "${best.line}"`,
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function firstLineWith(text: string, needle: string): string {
  const lines = text.split(/\r?\n|(?<=[.!?])\s+/);
  const nd = needle.toLowerCase();
  return (lines.find((l) => l.toLowerCase().includes(nd)) ?? text).trim();
}
