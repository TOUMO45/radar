import type { Clock, StoragePort } from "@scenelock/ports";
import type { Archivist } from "@scenelock/archivist";
import type { Directive, Finding, Shot } from "@scenelock/schema";
import { attemptUsd } from "@scenelock/config";
import type { AttemptCost } from "./budget.js";

/**
 * Veo client seam (spec E.1). Real: submit a regeneration job, poll, ingest.
 * Mock: apply a scripted fix for the targeted finding to the DRY_RUN inputs so
 * the next gate pass no longer raises it. Infra failures don't consume budget
 * (G-06).
 */
export interface VeoResult {
  ok: boolean;
  infra_fail?: boolean;
  shot?: Shot;
  cost: AttemptCost;
}

export interface VeoBackend {
  generate(directive: Directive, finding: Finding, shot: Shot): Promise<VeoResult>;
}

export interface MockVeoOptions {
  /** fail with a (non-budget-consuming) infra error on these 1-based attempt numbers. */
  failInfraOn?: number[];
  /** deliberately break a directive invariant to exercise the R2 "new finding" path. */
  breakInvariant?: boolean;
  costPerAttempt?: AttemptCost;
}

export class MockVeoBackend implements VeoBackend {
  private calls = 0;
  constructor(
    private deps: { storage: StoragePort; archivist: Archivist; clock: Clock },
    private opts: MockVeoOptions = {},
  ) {}

  async generate(directive: Directive, finding: Finding, shot: Shot): Promise<VeoResult> {
    this.calls += 1;
    const cost =
      this.opts.costPerAttempt ??
      { veo_seconds: 8, gemini_tokens: 42_000, usd: round2(attemptUsd(8, 42_000)) };

    if (this.opts.failInfraOn?.includes(this.calls)) {
      return { ok: false, infra_fail: true, cost: { veo_seconds: 0, gemini_tokens: 0, usd: 0 } };
    }

    const now = this.deps.clock.now();
    let updated: Shot = {
      ...shot,
      attempt_no: shot.attempt_no + 1,
      veo_job_id: `veo-job-${shot.shot_id}-r${shot.attempt_no + 1}`,
      content_hash: `sha256:${shot.shot_id}-r${shot.attempt_no + 1}`,
      status: "gates_complete",
    };

    // --- scripted fix per targeted risk class ---------------------------
    switch (finding.risk_class) {
      case "ai_disclosure": {
        updated = {
          ...updated,
          c2pa: { present: true, valid: true, manifest_uri: `gs://radar-dev-org-org_demo/shots/${shot.shot_id}/c2pa/manifest.json` },
        };
        break;
      }
      case "real_person": {
        const d = await this.deps.storage.getDialogue(shot.shot_id);
        if (d) {
          const swapped = d.script.replace(
            /Senator\s+Dale\s+Hargrove|Dale\s+Hargrove|Senator\s+Hargrove/gi,
            "Senator Alvarez",
          );
          await this.deps.storage.putDialogue(shot.shot_id, { ...d, script: swapped });
        }
        break;
      }
      case "trademark": {
        const d = await this.deps.storage.getDialogue(shot.shot_id);
        if (d) await this.deps.storage.putDialogue(shot.shot_id, { ...d, ocr_label: "" });
        break;
      }
      case "lyrics": {
        const d = await this.deps.storage.getDialogue(shot.shot_id);
        if (d) await this.deps.storage.putDialogue(shot.shot_id, { ...d, audio_cue: "" });
        break;
      }
      case "continuity.state":
      case "continuity.presence":
      case "continuity.identity": {
        // the regen brings the entity to its expected state — patch the shot's
        // continuity observation so the re-run of gate-continuity sees it fixed.
        const plan = await this.deps.storage.getContinuity(shot.shot_id);
        if (plan && finding.entity_id) {
          const eid = finding.entity_id;
          const expected = plan.expected[eid] ?? finding.state_expected ?? null;
          const fixed = {
            entity_id: eid,
            present: true,
            observed_state: expected,
            identity_cosine: finding.risk_class === "continuity.identity" ? 0.95 : null,
          };
          const observed = plan.observed.some((o) => o.entity_id === eid)
            ? plan.observed.map((o) =>
                o.entity_id !== eid
                  ? o
                  : { ...o, present: true, observed_state: expected, identity_cosine: fixed.identity_cosine ?? o.identity_cosine },
              )
            : [...plan.observed, fixed];
          await this.deps.storage.putContinuity(shot.shot_id, { ...plan, observed });
        }
        break;
      }
      default:
        break;
    }

    if (this.opts.breakInvariant) {
      // regression outside the directive: an unexpected entity appears (R2)
      const scene = await this.deps.storage.getScene(shot.scene_id);
      await this.deps.storage.putFinding({
        finding_id: `f_inv_${shot.shot_id}_${updated.attempt_no}`,
        scene_id: shot.scene_id,
        shot_id: shot.shot_id,
        frame: null,
        gate: "continuity",
        sub_gate: null,
        stage: "shot",
        risk_class: "continuity.unexpected",
        rule: "invariant_violation",
        description: `Regeneration of ${shot.shot_id} changed something outside the directive: ${directive.invariants[0] ?? "an invariant"} no longer holds.`,
        recommendation: "Re-run with a tighter directive.",
        severity: "high",
        confidence: 1,
        measurement: { metric: "invariant_held", value: 0, threshold: 1 },
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
        created_at: now,
        schema_version: "2.1",
      });
      void scene;
    }

    // A compliant re-render emits a *marked* shot: valid C2PA, a detectable
    // watermark and a perceptible AI label (R2/R7). We upgrade the shot's
    // provenance marking on every regeneration — but never fabricate consent
    // (a deceased/living replica still needs a real licence, cleared via R5).
    const prov = await this.deps.storage.getProvenance(shot.shot_id);
    if (prov && prov.is_ai_generated) {
      await this.deps.storage.putProvenance({
        ...prov,
        c2pa: { present: true, valid: true, manifest_uri: prov.c2pa?.manifest_uri ?? null },
        watermark: { present: true, method: "synthid", detectable: true },
        perceptible_label: { present: true },
      });
    }

    await this.deps.storage.putShot(updated);
    return { ok: true, shot: updated, cost };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
