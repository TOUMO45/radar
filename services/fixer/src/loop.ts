import type { Clock, EventBusPort, IdGen, StoragePort } from "@scenelock/ports";
import type { Archivist } from "@scenelock/archivist";
import type { GateClearance } from "@scenelock/gate-clearance";
import type { GateContinuity } from "@scenelock/gate-continuity";
import type { IncidentWatchdog } from "@scenelock/incidents";
import type { MediaProcessor } from "@scenelock/media-processor";
import { computeVerdict } from "@scenelock/verdict";
import {
  computeBlocking,
  type Attempt,
  type Directive,
  type Finding,
  type SceneVerdict,
} from "@scenelock/schema";
import { addCost, evaluateBudget } from "./budget.js";
import { compileDirective } from "./directive.js";
import { MockVeoBackend, type VeoBackend } from "./veo.js";

export { evaluateBudget, addCost } from "./budget.js";
export type { BudgetStatus, BudgetLevel } from "./budget.js";
export { compileDirective } from "./directive.js";
export { MockVeoBackend } from "./veo.js";
export type { VeoBackend } from "./veo.js";

export type RemediationOutcome =
  | "resolved"
  | "escalated"
  | "paused_budget"
  | "no_op";

export interface RemediationResult {
  finding_id: string;
  outcome: RemediationOutcome;
  attempts: number;
  directive_id: string | null;
}

export interface RemediationLoopDeps {
  storage: StoragePort;
  clock: Clock;
  ids: IdGen;
  events?: EventBusPort;
  archivist: Archivist;
  mediaProcessor: MediaProcessor;
  gateClearance: GateClearance;
  gateContinuity: GateContinuity;
  incidents: IncidentWatchdog;
  veo?: VeoBackend;
}

const UNRESOLVED = new Set(["open", "in_remediation", "escalated"]);
const CONTINUITY = new Set(["continuity.state", "continuity.presence", "continuity.identity"]);
const INFRA_RETRY_CAP = 2;

/**
 * Bounded remediation loop (spec §6, E.3). Cloud Workflows in production; here a
 * local state machine over the ports. Budget-checked before every regen (E.12);
 * infra failures don't consume a loop attempt (G-06); invariants re-verified
 * after regen — a violation is a new finding, never a silent pass (R2).
 */
export class RemediationLoop {
  private veo: VeoBackend;
  constructor(private d: RemediationLoopDeps) {
    this.veo =
      d.veo ?? new MockVeoBackend({ storage: d.storage, archivist: d.archivist, clock: d.clock });
  }

  async remediateScene(sceneId: string): Promise<{ results: RemediationResult[]; verdict: SceneVerdict | null }> {
    const scene = await this.d.storage.getScene(sceneId);
    if (!scene) return { results: [], verdict: null };
    const production = await this.d.storage.getProduction(scene.production_id);
    const tau = production?.settings.tau ?? 0.7;

    const blocking = (await this.d.storage.listFindings(scene.production_id, { scene: sceneId }))
      .filter((f) => computeBlocking(f, tau) && UNRESOLVED.has(f.status))
      .map((f) => f.finding_id);

    const results: RemediationResult[] = [];
    for (const fid of blocking) {
      results.push(await this.remediateFinding(fid));
      const p = await this.d.storage.getProduction(scene.production_id);
      if (p?.kill_switch) break; // budget kill halts the scene loop
    }

    const verdict = await this.verdict(sceneId);
    if (verdict) this.d.events?.emitSse({ type: "verdict.changed", data: verdict });
    return { results, verdict };
  }

  async remediateFinding(
    findingId: string,
    opts: { manual?: boolean } = {},
  ): Promise<RemediationResult> {
    const finding = await this.d.storage.getFinding(findingId);
    if (!finding || !finding.shot_id) return { finding_id: findingId, outcome: "no_op", attempts: 0, directive_id: null };
    const scene = await this.d.storage.getScene(finding.scene_id);
    const production = await this.d.storage.getProduction(scene?.production_id ?? "");
    if (!scene || !production) return { finding_id: findingId, outcome: "no_op", attempts: 0, directive_id: null };
    const tau = production.settings.tau;
    if (!(computeBlocking(finding, tau) && UNRESOLVED.has(finding.status)))
      return { finding_id: findingId, outcome: "no_op", attempts: 0, directive_id: null };

    const budgetCap = production.settings.loop_budget;
    const directive = await compileDirective(
      { storage: this.d.storage, archivist: this.d.archivist, clock: this.d.clock, ids: this.d.ids },
      finding,
      opts,
    );
    await this.d.storage.putDirective(directive);

    await this.d.storage.putFinding({
      ...finding,
      status: "in_remediation",
      remediation: { directive_id: directive.directive_id, attempts: 0, status: "running" },
    });
    this.log("compile_directive", { finding_id: findingId, directive_id: directive.directive_id });

    let attemptNo = 0;
    let infraRetries = 0;

    while (attemptNo < budgetCap) {
      // --- budget gate (E.12) — before any Veo call --------------------
      const fresh = (await this.d.storage.getProduction(production.production_id))!;
      const status = evaluateBudget(fresh.spend, fresh.settings.cost_caps, {
        veo_seconds: 8,
        gemini_tokens: 42_000,
        usd: 2.9,
        attempts: 1,
      });
      if (status.level === "kill") {
        await this.d.storage.putProduction({ ...fresh, kill_switch: true });
        this.d.events?.emitSse({ type: "system.degraded", data: { component: "cost-governor", mode: "kill_switch" } });
        this.d.events?.emitSse({
          type: "cost.updated",
          data: { productionId: production.production_id, spend: fresh.spend.usd, cap: fresh.settings.cost_caps.usd_cap ?? 0 },
        });
        this.log("check_budget", { finding_id: findingId, level: "kill" });
        return { finding_id: findingId, outcome: "paused_budget", attempts: attemptNo, directive_id: directive.directive_id };
      }
      if (status.level === "warn") {
        this.d.events?.emitSse({
          type: "cost.updated",
          data: { productionId: production.production_id, spend: fresh.spend.usd, cap: fresh.settings.cost_caps.usd_cap ?? 0 },
        });
      }

      attemptNo += 1;
      const shot = (await this.d.storage.getShot(finding.shot_id))!;
      const attempt: Attempt = {
        attempt_no: attemptNo,
        directive_id: directive.directive_id,
        shot_id: finding.shot_id,
        state: "generating",
        cost: { veo_seconds: 0, gemini_tokens: 0, usd: 0 },
        latency_ms: null,
        outcome: null,
        manual: opts.manual ?? false,
        created_at: this.d.clock.now(),
      };
      await this.d.storage.putAttempt(attempt);
      this.d.events?.emitSse({ type: "loop.attempt", data: { attemptId: `${directive.directive_id}#${attemptNo}`, state: "generating", n: attemptNo } });

      const regen = await this.veo.generate(directive, finding, shot);

      if (!regen.ok && regen.infra_fail) {
        await this.d.storage.putAttempt({ ...attempt, state: "failed_infra", outcome: "infra error (no budget consumed)" });
        this.log("generate", { finding_id: findingId, attempt: attemptNo, state: "failed_infra" });
        infraRetries += 1;
        attemptNo -= 1; // G-06: infra failure does not consume a loop attempt
        if (infraRetries > INFRA_RETRY_CAP) return this.escalate(finding, directive, attemptNo, tau);
        continue;
      }

      // consume budget (E.12)
      const p2 = (await this.d.storage.getProduction(production.production_id))!;
      await this.d.storage.putProduction({ ...p2, spend: addCost(p2.spend, regen.cost, 1) });
      await this.d.storage.putAttempt({ ...attempt, state: "ingested", cost: regen.cost });

      // process + re-verify — BOTH gates on the regenerated shot (E.3 rerun_gates)
      await this.d.mediaProcessor.process(finding.shot_id);
      await this.d.storage.putAttempt({ ...attempt, state: "verifying", cost: regen.cost });
      const clr = await this.d.gateClearance.runShot(finding.shot_id);
      const cont = await this.d.gateContinuity.runShot(finding.shot_id);
      await this.reconcileShotFindings(production.production_id, finding.scene_id, finding.shot_id, [
        ...clr.findings,
        ...cont.findings,
      ]);

      const resolved = await this.isTargetResolved(finding);
      const invariantViolations = await this.checkInvariants(production.production_id, finding.shot_id);

      if (resolved && invariantViolations.length === 0) {
        await this.d.storage.putAttempt({
          ...attempt,
          state: "passed",
          cost: regen.cost,
          latency_ms: 41_000,
          outcome: "target finding cleared; invariants held",
        });
        await this.markResolved(finding, directive, attemptNo);
        this.d.events?.emitSse({ type: "loop.attempt", data: { attemptId: `${directive.directive_id}#${attemptNo}`, state: "passed", n: attemptNo } });
        this.log("resolve", { finding_id: findingId, attempts: attemptNo });
        await this.d.incidents.sweep(production.production_id, tau);
        const v = await this.verdict(finding.scene_id);
        if (v) this.d.events?.emitSse({ type: "verdict.changed", data: v });
        return { finding_id: findingId, outcome: "resolved", attempts: attemptNo, directive_id: directive.directive_id };
      }

      await this.d.storage.putAttempt({
        ...attempt,
        state: "failed_iteration",
        cost: regen.cost,
        latency_ms: 40_000,
        outcome: invariantViolations.length ? `invariant violation: ${invariantViolations[0]!.finding_id}` : "target finding still present",
      });
      this.log("check", { finding_id: findingId, attempt: attemptNo, state: "failed_iteration" });
    }

    return this.escalate(finding, directive, attemptNo, tau);
  }

  // ---- helpers --------------------------------------------------------

  private async isTargetResolved(finding: Finding): Promise<boolean> {
    const shotId = finding.shot_id!;
    const production = await this.d.storage.getScene(finding.scene_id).then((s) => s?.production_id ?? "");
    const shotFindings = await this.d.storage.listFindings(production, { scene: finding.scene_id, shot: shotId });

    const gate = CONTINUITY.has(finding.risk_class) ? "continuity" : "clearance";
    const stillThere = shotFindings.some(
      (f) => f.gate === gate && f.risk_class === finding.risk_class && UNRESOLVED.has(f.status),
    );
    if (stillThere) return false;
    if (finding.risk_class === "ai_disclosure") {
      const shot = await this.d.storage.getShot(shotId);
      return shot?.c2pa?.valid === true;
    }
    return true;
  }

  private async checkInvariants(pid: string, shotId: string): Promise<Finding[]> {
    const fresh = await this.d.storage.listFindings(pid, { shot: shotId });
    return fresh.filter((f) => f.rule === "invariant_violation" && UNRESOLVED.has(f.status));
  }

  private async reconcileShotFindings(
    pid: string,
    sceneId: string,
    shotId: string,
    fresh: Finding[],
  ): Promise<void> {
    const existing = await this.d.storage.listFindings(pid, { scene: sceneId, shot: shotId });
    for (const f of existing) {
      // gate-authored shot findings are replaced wholesale; loop-authored
      // invariant-violation findings (R2) persist until separately resolved.
      if (
        f.stage === "shot" &&
        f.rule !== "invariant_violation" &&
        (f.gate === "clearance" || f.gate === "continuity")
      ) {
        await this.d.storage.deleteFinding(f.finding_id);
      }
    }
    for (const f of fresh) await this.d.storage.putFinding(f);
  }

  private async markResolved(finding: Finding, directive: Directive, attempts: number): Promise<void> {
    // clearance targets are removed by reconcile; continuity targets persist.
    const still = await this.d.storage.getFinding(finding.finding_id);
    if (still) {
      await this.d.storage.putFinding({
        ...still,
        status: "resolved",
        remediation: { directive_id: directive.directive_id, attempts, status: "passed" },
      });
    }
    this.d.events?.emitSse({
      type: "finding.updated",
      data: { findingId: finding.finding_id, patch: { status: "resolved" } },
    });
  }

  private async escalate(
    finding: Finding,
    directive: Directive,
    attempts: number,
    tau: number,
  ): Promise<RemediationResult> {
    const pid = (await this.d.storage.getScene(finding.scene_id))?.production_id ?? "";
    // the target may have been reconciled away and re-raised — escalate the live one
    const live =
      (await this.d.storage.getFinding(finding.finding_id)) ??
      (await this.d.storage.listFindings(pid, { scene: finding.scene_id, shot: finding.shot_id! })).find(
        (f) => f.risk_class === finding.risk_class,
      ) ??
      finding;
    await this.d.storage.putFinding({
      ...live,
      status: "escalated",
      severity: "high",
      remediation: { directive_id: directive.directive_id, attempts, status: "escalated" },
    });
    this.log("escalate", { finding_id: live.finding_id, attempts });
    this.d.events?.emitSse({ type: "finding.updated", data: { findingId: live.finding_id, patch: { status: "escalated" } } });
    await this.d.incidents.sweep(pid, tau);
    const v = await this.verdict(finding.scene_id);
    if (v) this.d.events?.emitSse({ type: "verdict.changed", data: v });
    return { finding_id: live.finding_id, outcome: "escalated", attempts, directive_id: directive.directive_id };
  }

  private async verdict(sceneId: string): Promise<SceneVerdict | null> {
    const scene = await this.d.storage.getScene(sceneId);
    if (!scene) return null;
    const production = await this.d.storage.getProduction(scene.production_id);
    if (!production) return null;
    const [shots, findings] = await Promise.all([
      this.d.storage.listShots(sceneId),
      this.d.storage.listFindings(production.production_id, { scene: sceneId }),
    ]);
    return computeVerdict({
      scene_id: sceneId,
      tau: production.settings.tau,
      config_version: production.settings.config_version,
      kill_switch: production.kill_switch,
      shots,
      findings,
      now: () => this.d.clock.now(),
    });
  }

  private log(step: string, extra: Record<string, unknown>): void {
    // structured Loki line (spec E.3): { loop, step, ... }
    void this.d.events?.publish("loop.control", { loop: "remediation", step, ...extra });
  }
}
