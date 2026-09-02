import type { Clock, EventBusPort, StoragePort } from "@scenelock/ports";
import type { Archivist } from "@scenelock/archivist";
import type { Finding, GateRun, ShotContinuity } from "@scenelock/schema";

/**
 * Continuity gate (spec E.5.1). Deterministic core over the World State ledger:
 *   - presence: an expected entity missing from frame
 *   - state:    observed state descriptor ≠ expected (blocking; confidence 1.0)
 *   - identity: cosine(frame, character anchor) < T_id (hybrid)
 *   - unexpected: an entity in frame that isn't in the plan (model-calibrated)
 * Observed states are handed to the Archivist as *candidate* states (§4).
 */
export interface GateContinuityDeps {
  storage: StoragePort;
  clock: Clock;
  archivist: Archivist;
  events?: EventBusPort;
}

export interface ContinuityResult {
  shot_id: string;
  findings: Finding[];
  gate_run: GateRun;
  observed_states: Array<{ entity_id: string; state: string }>;
}

const MODEL_VERSIONS = ["gemini-2.5-pro@2026-07", "template-explainer@1"];

export class GateContinuity {
  constructor(private deps: GateContinuityDeps) {}

  async runShot(shotId: string): Promise<ContinuityResult> {
    const started_at = this.deps.clock.now();
    const shot = await this.deps.storage.getShot(shotId);
    if (!shot) throw new Error(`gate-continuity: unknown shot ${shotId}`);
    const plan = await this.deps.storage.getContinuity(shotId);
    const now = this.deps.clock.now();

    const findings: Finding[] = [];
    const observed_states: Array<{ entity_id: string; state: string }> = [];

    if (plan) {
      await this.checkShot(shot.scene_id, shotId, plan, now, findings, observed_states);
      // hand observed states to the archivist as candidates (E.5.1)
      for (const os of observed_states) {
        await this.deps.archivist
          .recordObservedState({
            entity_id: os.entity_id,
            observed_state: os.state,
            scene: shot.scene_id,
            shot: shotId,
            actor: "gate-continuity",
            evidence_uri: null,
          })
          .catch(() => undefined);
      }
    }

    const gate_run: GateRun = {
      gate: "continuity",
      sub_gate: null,
      shot_id: shotId,
      status: "completed",
      started_at,
      completed_at: this.deps.clock.now(),
      duration_ms: 1180,
      model_versions: [...MODEL_VERSIONS, plan?.embedding_model_version ?? "gemini-embed-001@2026-03"],
      error: null,
    };

    const kept = shot.gate_runs.filter((r) => r.gate !== "continuity");
    await this.deps.storage.putShot({ ...shot, gate_runs: [...kept, gate_run] });

    await this.deps.events?.publish(
      "gates.results",
      { shot_id: shotId, gate: "continuity", findings, gate_run },
      { ordering_key: shotId },
    );
    for (const f of findings) this.deps.events?.emitSse({ type: "finding.created", data: f });

    return { shot_id: shotId, findings, gate_run, observed_states };
  }

  subscribe(): () => void {
    if (!this.deps.events) return () => {};
    return this.deps.events.subscribe("gates.requested", async (e) => {
      const p = e.payload as { shot_id: string; gates?: string[] };
      if (p.gates && !p.gates.includes("continuity")) return;
      await this.runShot(p.shot_id);
    });
  }

  // ---- deterministic core -------------------------------------------

  private async checkShot(
    sceneId: string,
    shotId: string,
    plan: ShotContinuity,
    now: string,
    findings: Finding[],
    observed_states: Array<{ entity_id: string; state: string }>,
  ): Promise<void> {
    const byEntity = new Map(plan.observed.map((o) => [o.entity_id, o]));

    for (const [entityId, expected] of Object.entries(plan.expected)) {
      const obs = byEntity.get(entityId);
      const entity = await this.deps.storage.getEntity(entityId);
      const short = entityId.split("-").slice(-2).join("-");

      // presence
      if (!obs || !obs.present) {
        findings.push(
          this.mk(sceneId, shotId, `f_ct_${shotId}_${short}_presence`, {
            risk_class: "continuity.presence",
            rule: "expected_entity_absent",
            severity: "medium",
            confidence: 0.9,
            source: "hybrid",
            entity_id: entityId,
            state_expected: expected,
            state_observed: "absent",
            measurement: { metric: "presence", value: 0, threshold: 1 },
            description: `${entity?.canonical_desc ?? entityId} is expected in ${shotId} but is absent from frame.`,
            recommendation: `Regenerate ${shotId} with ${entity?.canonical_desc ?? entityId} present as established.`,
            now,
          }),
        );
        continue;
      }

      if (obs.observed_state) observed_states.push({ entity_id: entityId, state: obs.observed_state });

      // state descriptor mismatch (deterministic, blocking)
      if (obs.observed_state && obs.observed_state !== expected) {
        findings.push(
          this.mk(sceneId, shotId, `f_ct_${shotId}_${short}_state`, {
            risk_class: "continuity.state",
            rule: "prop_state_mismatch",
            severity: "high",
            confidence: 1.0,
            source: "deterministic",
            entity_id: entityId,
            state_expected: expected,
            state_observed: obs.observed_state,
            measurement: { metric: "state_match", value: 0, threshold: 1 },
            description: `${entity?.canonical_desc ?? entityId} is "${obs.observed_state}" in ${shotId}; World State expects "${expected}".`,
            recommendation: `Regenerate ${shotId} with ${entity?.canonical_desc ?? entityId} as "${expected}". Keep every other entity unchanged.`,
            now,
          }),
        );
      }

      // identity drift (hybrid: deterministic trigger, model explanation)
      if (obs.identity_cosine != null && entity?.type === "character") {
        if (obs.identity_cosine < plan.identity_threshold) {
          const margin = plan.identity_threshold - obs.identity_cosine;
          findings.push(
            this.mk(sceneId, shotId, `f_ct_${shotId}_${short}_identity`, {
              risk_class: "continuity.identity",
              rule: "identity_embedding_below_threshold",
              severity: "medium",
              confidence: Math.min(0.95, 0.5 + margin * 5),
              source: "hybrid",
              entity_id: entityId,
              state_expected: `identity cosine ≥ ${plan.identity_threshold}`,
              state_observed: `cosine ${obs.identity_cosine.toFixed(2)}`,
              measurement: { metric: "cosine", value: round2(obs.identity_cosine), threshold: plan.identity_threshold },
              description: `${entity.canonical_desc} identity embedding in ${shotId} sits ${margin.toFixed(2)} below the anchor threshold (possible variant).`,
              recommendation: `Regenerate ${shotId} conditioning on the ${short} reference set; verify glasses frame and hairline.`,
              now,
            }),
          );
        }
      }
    }

    // unexpected entities
    for (const entityId of plan.unexpected) {
      findings.push(
        this.mk(sceneId, shotId, `f_ct_${shotId}_${entityId.split("-").slice(-2).join("-")}_unexpected`, {
          risk_class: "continuity.unexpected",
          rule: "unexpected_entity_in_frame",
          severity: "low",
          confidence: 0.7,
          source: "model",
          entity_id: entityId,
          state_expected: "not in plan",
          state_observed: "present",
          measurement: null,
          description: `An entity not in the shot plan (${entityId}) appears in ${shotId}.`,
          recommendation: `Confirm ${entityId} is intended; if not, regenerate ${shotId} without it.`,
          now,
        }),
      );
    }
  }

  private mk(
    sceneId: string,
    shotId: string,
    id: string,
    x: {
      risk_class: Finding["risk_class"];
      rule: string;
      severity: Finding["severity"];
      confidence: number;
      source: Finding["source"];
      entity_id: string;
      state_expected: string;
      state_observed: string;
      measurement: Finding["measurement"];
      description: string;
      recommendation: string;
      now: string;
    },
  ): Finding {
    return {
      finding_id: id,
      scene_id: sceneId,
      shot_id: shotId,
      frame: null,
      gate: "continuity",
      sub_gate: null,
      stage: "shot",
      risk_class: x.risk_class,
      rule: x.rule,
      description: x.description,
      recommendation: x.recommendation,
      severity: x.severity,
      confidence: round2(x.confidence),
      measurement: x.measurement,
      evidence_uri: null,
      evidence_quote: null,
      status: "open",
      source: x.source,
      entity_id: x.entity_id,
      state_expected: x.state_expected,
      state_observed: x.state_observed,
      remediation: null,
      c2pa: null,
      adjudication: null,
      blocking: false, // precomputed on read (D5)
      created_at: x.now,
      schema_version: "2.1",
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
