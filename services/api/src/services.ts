import {
  computeBlocking,
  type Adjudication,
  type ComplianceProfile,
  type Finding,
  type ProductionRollup,
  type SceneVerdict,
  type ShotProvenance,
  type UnderwritingPack,
} from "@scenelock/schema";
import { computeVerdict } from "@scenelock/verdict";
import { evaluateBudget } from "@scenelock/fixer";
import { gateCompliance, type ComplianceReport } from "@scenelock/gate-compliance";
import { computeDeliveryReadiness, computeTrustScore } from "@scenelock/trust";
import { assembleUnderwritingPack, renderUnderwritingMarkdown } from "@scenelock/underwriting";
import { C2paToolProvenanceAdapter, c2patoolAvailable } from "@scenelock/provenance";
import type { ProvenanceVerification } from "@scenelock/schema";
import type { FindingFilter } from "@scenelock/ports";
import type { AppContext } from "./context.js";

/**
 * Service layer over the storage port. Verdict is computed live via the one
 * lock-logic home (D5); `blocking` is precomputed on every finding read (G-14).
 */
export class Services {
  constructor(private ctx: AppContext) {}

  private async tau(pid: string): Promise<number> {
    const p = await this.ctx.storage.getProduction(pid);
    return p?.settings.tau ?? 0.7;
  }

  private withBlocking(findings: Finding[], tau: number): Finding[] {
    return findings.map((f) => ({ ...f, blocking: computeBlocking(f, tau) }));
  }

  async listProductions(orgId: string): Promise<ProductionRollup[]> {
    const prods = await this.ctx.storage.listProductions(orgId);
    const out: ProductionRollup[] = [];
    for (const production of prods) {
      const scenes = await this.ctx.storage.listScenes(production.production_id);
      const scenes_by_status: Record<string, number> = {};
      for (const s of scenes)
        scenes_by_status[s.status] = (scenes_by_status[s.status] ?? 0) + 1;
      const v = await this.sceneVerdict(scenes[0]?.scene_id ?? "");
      out.push({
        production,
        scenes_by_status,
        open_blocking: v?.inputs.blocking_open ?? 0,
        usd_spent: production.spend.usd,
      });
    }
    return out;
  }

  getProduction(pid: string) {
    return this.ctx.storage.getProduction(pid);
  }

  /**
   * GET /v1/orgs/:orgId/portfolio (roadmap R8) — the slate at a glance: every
   * production's Trust Score, deliverability and E&O-bindability, rolled up from
   * the same per-scene numbers. The producer's executive view.
   */
  async portfolio(orgId: string) {
    const prods = await this.ctx.storage.listProductions(orgId);
    const entries = [];
    for (const production of prods) {
      const scenes = await this.ctx.storage.listScenes(production.production_id);
      const lead = scenes[0]?.scene_id ?? null;
      let trust_score = 100;
      let trust_band: "green" | "amber" | "red" = "green";
      let delivery_ready = true;
      let blocked_targets: string[] = [];
      let bindable = true;
      let open_blocking = 0;
      if (lead) {
        const [ts, del, pack, v] = await Promise.all([
          this.sceneTrustScore(lead),
          this.sceneDeliveryReadiness(lead),
          this.underwritingPack(lead),
          this.sceneVerdict(lead),
        ]);
        if (ts) {
          trust_score = ts.score;
          trust_band = ts.band;
        }
        if (del) {
          delivery_ready = del.ready;
          blocked_targets = del.targets.filter((t) => !t.ready).map((t) => t.label);
        }
        if (pack) bindable = pack.bindable;
        open_blocking = v?.inputs.blocking_open ?? 0;
      }
      entries.push({
        production_id: production.production_id,
        title: production.title,
        lead_scene: lead,
        trust_score,
        trust_band,
        delivery_ready,
        blocked_targets,
        bindable,
        open_blocking,
        usd_spent: production.spend.usd,
      });
    }
    const slate_trust =
      entries.length === 0
        ? 0
        : Math.round(entries.reduce((a, e) => a + e.trust_score, 0) / entries.length);
    return {
      org_id: orgId,
      generated_at: this.ctx.clock.now(),
      entries,
      slate_trust,
      deliverable_count: entries.filter((e) => e.delivery_ready).length,
      bindable_count: entries.filter((e) => e.bindable).length,
      production_count: entries.length,
    };
  }

  async listScenes(pid: string) {
    const scenes = await this.ctx.storage.listScenes(pid);
    return Promise.all(
      scenes.map(async (s) => ({ ...s, verdict: await this.sceneVerdict(s.scene_id) })),
    );
  }

  async getScene(sid: string) {
    const s = await this.ctx.storage.getScene(sid);
    if (!s) return null;
    return { ...s, verdict: await this.sceneVerdict(sid) };
  }

  listShots(sid: string) {
    return this.ctx.storage.listShots(sid);
  }

  async sceneVerdict(sid: string): Promise<SceneVerdict | null> {
    const scene = await this.ctx.storage.getScene(sid);
    if (!scene) return null;
    const production = await this.ctx.storage.getProduction(scene.production_id);
    if (!production) return null;
    const [shots, findings] = await Promise.all([
      this.ctx.storage.listShots(sid),
      this.ctx.storage.listFindings(production.production_id, { scene: sid }),
    ]);
    return computeVerdict({
      scene_id: sid,
      tau: production.settings.tau,
      config_version: production.settings.config_version,
      kill_switch: production.kill_switch,
      shots,
      findings,
      now: () => this.ctx.clock.now(),
    });
  }

  async listFindings(pid: string, filter: FindingFilter = {}) {
    const tau = await this.tau(pid);
    // precompute blocking, THEN apply a blocking filter against the fresh value
    const all = this.withBlocking(await this.ctx.storage.listFindings(pid, {}), tau);
    return all.filter((f) => {
      if (filter.scene && f.scene_id !== filter.scene) return false;
      if (filter.gate && f.gate !== filter.gate) return false;
      if (filter.risk_class && f.risk_class !== filter.risk_class) return false;
      if (filter.status && f.status !== filter.status) return false;
      if (filter.source && f.source !== filter.source) return false;
      if (filter.stage && f.stage !== filter.stage) return false;
      if (filter.shot && f.shot_id !== filter.shot) return false;
      if (filter.blocking !== undefined && f.blocking !== filter.blocking) return false;
      return true;
    });
  }

  async getFinding(fid: string) {
    const f = await this.ctx.storage.getFinding(fid);
    if (!f) return null;
    const production_id = (await this.ctx.storage.getScene(f.scene_id))?.production_id ?? "";
    const tau = await this.tau(production_id);
    const [directives, attempts, adjudications] = await Promise.all([
      this.ctx.storage.listDirectives(production_id),
      this.ctx.storage.listAttempts(production_id),
      this.ctx.storage.listAdjudications(fid),
    ]);
    const directive = directives.find((d) => d.target_finding_id === fid) ?? null;
    return {
      finding: this.withBlocking([f], tau)[0]!,
      directive,
      attempts: attempts.filter((a) => a.directive_id === directive?.directive_id),
      adjudications,
    };
  }

  async loop(pid: string) {
    const [directives, attempts] = await Promise.all([
      this.ctx.storage.listDirectives(pid),
      this.ctx.storage.listAttempts(pid),
    ]);
    return { directives, attempts };
  }

  listEntities(pid: string) {
    return this.ctx.storage.listEntities(pid);
  }
  getEntity(eid: string) {
    return this.ctx.storage.getEntity(eid);
  }
  getMediaArtifacts(shotId: string) {
    return this.ctx.storage.getMediaArtifacts(shotId);
  }
  listIncidents(pid: string) {
    return this.ctx.storage.listIncidents(pid);
  }
  listConsentRecords(pid: string) {
    return this.ctx.storage.listConsentRecords(pid);
  }
  reanchor(pid: string, version: string) {
    return this.ctx.archivist.reanchor(pid, version);
  }
  getCertificate(cid: string) {
    return this.ctx.certifier.getCertificate(cid);
  }
  getSceneCertificate(sid: string) {
    return this.ctx.certifier.getSceneCertificate(sid);
  }
  listCertificates(pid: string) {
    return this.ctx.certifier.listCertificates(pid);
  }
  verifyCertificate(slug: string) {
    return this.ctx.certifier.verify(slug);
  }
  getScorecard() {
    return this.ctx.storage.getScorecard();
  }
  async runSceneBench() {
    const card = await this.ctx.saboteur.run();
    await this.ctx.storage.putScorecard(card);
    return card;
  }

  /** Sign the certificate when a scene is LOCKED (Flow B step 7 / E.1). */
  async certifyScene(sid: string) {
    const existing = await this.ctx.certifier.getSceneCertificate(sid);
    if (existing) return existing;
    return this.ctx.certifier.certify(sid);
  }

  /** Reload the DRY_RUN seed (demo spine, H.2). */
  async demoReset() {
    await this.ctx.storage.reset();
    await this.sweepIncidents("p_dry");
    const v = await this.sceneVerdict("sc_12");
    this.ctx.events.emitSse({ type: "demo.act", data: { act: 0, title: "reset", note: "DRY_RUN seed reloaded" } });
    return { verdict: v };
  }

  /**
   * The one-take demo spine (H.2 Acts 1–3), all over one SSE stream:
   *  Act 1 — gates run, findings + incidents, scene HELD
   *  Act 2 — the loop is visible (directives, budget)
   *  Act 3 — auto-remediate → LOCKED → certificate signs
   */
  async demoRun(sceneId = "sc_12") {
    const acts: Array<{ act: number; title: string; detail: unknown }> = [];
    const mark = (act: number, title: string, note = "") =>
      this.ctx.events.emitSse({ type: "demo.act", data: { act, title, note } });

    await this.demoReset();

    mark(1, "Gates sweep", "media-processor + clearance + continuity across 6 shots");
    const gated = await this.rerunGates(sceneId);
    acts.push({ act: 1, title: "Gates sweep", detail: { findings: gated.findings, verdict: gated.verdict?.verdict } });

    const scene = await this.ctx.storage.getScene(sceneId);
    const pid = scene?.production_id ?? "p_dry";
    const loop = await this.loop(pid);
    const incidents = await this.listIncidents(pid);
    mark(2, "Radar held", `${incidents.filter((i) => i.status === "open").length} incidents open, assigned to the Fixer`);
    acts.push({ act: 2, title: "Radar held", detail: { open_incidents: incidents.length, directives: loop.directives.length } });

    mark(3, "Self-heal", "compile directives → regenerate → re-verify → lock");
    const remediation = await this.autoRemediateScene(sceneId);
    acts.push({
      act: 3,
      title: "Self-heal",
      detail: {
        results: remediation.results,
        verdict: remediation.verdict?.verdict,
        certificate_slug: remediation.certificate?.slug ?? null,
      },
    });

    mark(4, remediation.verdict?.verdict === "LOCKED" ? "Certified" : "Held", "");
    return {
      acts,
      verdict: remediation.verdict,
      certificate: remediation.certificate,
    };
  }
  listAudit(orgId: string, limit?: number) {
    return this.ctx.storage.listAuditEntries(orgId, limit);
  }

  // --- synthetic-media compliance & trust (Radar 2026 extension) --------

  private defaultProfile(pid: string): ComplianceProfile {
    return { production_id: pid, territories: ["GLOBAL"], platforms: [] };
  }

  async getComplianceProfile(pid: string): Promise<ComplianceProfile | null> {
    const p = await this.ctx.storage.getProduction(pid);
    if (!p) return null;
    return (await this.ctx.storage.getComplianceProfile(pid)) ?? this.defaultProfile(pid);
  }

  async setComplianceProfile(
    pid: string,
    patch: { territories?: ComplianceProfile["territories"]; platforms?: ComplianceProfile["platforms"] },
  ): Promise<ComplianceProfile | null> {
    const p = await this.ctx.storage.getProduction(pid);
    if (!p) return null;
    const current = (await this.ctx.storage.getComplianceProfile(pid)) ?? this.defaultProfile(pid);
    const next: ComplianceProfile = {
      production_id: pid,
      territories: patch.territories ?? current.territories,
      platforms: patch.platforms ?? current.platforms,
    };
    await this.ctx.storage.putComplianceProfile(next);
    return next;
  }

  /** Run the Compliance Gate over a scene's provenance. Shared by the three surfaces. */
  private async complianceReport(sid: string): Promise<
    | {
        report: ComplianceReport;
        profile: ComplianceProfile;
        provenance: ShotProvenance[];
        production_id: string;
        tau: number;
      }
    | null
  > {
    const scene = await this.ctx.storage.getScene(sid);
    if (!scene) return null;
    const production = await this.ctx.storage.getProduction(scene.production_id);
    if (!production) return null;

    const shots = await this.ctx.storage.listShots(sid);
    const provenance = (
      await Promise.all(shots.map((s) => this.ctx.storage.getProvenance(s.shot_id)))
    ).filter((p): p is NonNullable<typeof p> => p !== null);
    const profile =
      (await this.ctx.storage.getComplianceProfile(production.production_id)) ??
      this.defaultProfile(production.production_id);
    const consentRecords = await this.ctx.storage.listConsentRecords(production.production_id);

    const report = gateCompliance.run({
      scene_id: sid,
      provenance,
      profile,
      consentRecords,
      tau: production.settings.tau,
      now: this.ctx.clock.now(),
    });
    return {
      report,
      profile,
      provenance,
      production_id: production.production_id,
      tau: production.settings.tau,
    };
  }

  /** GET /v1/scenes/:sid/compliance — cited findings per delivery target. */
  async sceneCompliance(sid: string) {
    const r = await this.complianceReport(sid);
    if (!r) return null;
    return {
      scene_id: sid,
      profile: r.profile,
      findings: r.report.findings,
      failing_targets: r.report.failing_targets,
      by_shot: r.report.by_shot,
    };
  }

  /** GET /v1/scenes/:sid/trust-score — one 0–100 headline over ALL findings. */
  async sceneTrustScore(sid: string) {
    const r = await this.complianceReport(sid);
    if (!r) return null;
    const stored = this.withBlocking(
      await this.ctx.storage.listFindings(r.production_id, { scene: sid }),
      r.tau,
    );
    return computeTrustScore({
      scene_id: sid,
      provenance: r.provenance,
      findings: [...stored, ...r.report.findings],
      now: this.ctx.clock.now(),
    });
  }

  /** GET /v1/scenes/:sid/delivery-readiness — per territory/platform can-ship matrix. */
  async sceneDeliveryReadiness(sid: string) {
    const r = await this.complianceReport(sid);
    if (!r) return null;
    return computeDeliveryReadiness({
      scene_id: sid,
      profile: r.profile,
      violations: r.report.violations,
      now: this.ctx.clock.now(),
    });
  }

  /**
   * GET /v1/scenes/:sid/underwriting-pack — the E&O / Underwriting Pack (R1):
   * one bundle of per-shot disclosure, consent, provenance, clearance +
   * compliance findings with waiver trail, the signed certificate, trust and
   * delivery readiness. Deterministic; the exact binder an underwriter reads.
   */
  async underwritingPack(sid: string): Promise<UnderwritingPack | null> {
    const r = await this.complianceReport(sid);
    if (!r) return null;
    const production = await this.ctx.storage.getProduction(r.production_id);
    if (!production) return null;

    const stored = this.withBlocking(
      await this.ctx.storage.listFindings(r.production_id, { scene: sid }),
      r.tau,
    );
    const trust = computeTrustScore({
      scene_id: sid,
      provenance: r.provenance,
      findings: [...stored, ...r.report.findings],
      now: this.ctx.clock.now(),
    });
    const delivery = computeDeliveryReadiness({
      scene_id: sid,
      profile: r.profile,
      violations: r.report.violations,
      now: this.ctx.clock.now(),
    });
    const certificate = await this.ctx.certifier.getSceneCertificate(sid);
    const consentRecords = await this.ctx.storage.listConsentRecords(r.production_id);

    return assembleUnderwritingPack({
      scene_id: sid,
      production,
      profile: r.profile,
      provenance: r.provenance,
      consentRecords,
      findings: [...stored, ...r.report.findings],
      trust,
      delivery,
      certificate,
      verify_prefix: "/verify",
      pack_id: this.ctx.ids.next("uwp"),
      now: this.ctx.clock.now(),
    });
  }

  /** The pack rendered as a human-readable underwriter's binder (Markdown). */
  async underwritingPackMarkdown(sid: string): Promise<string | null> {
    const pack = await this.underwritingPack(sid);
    return pack ? renderUnderwritingMarkdown(pack) : null;
  }

  /**
   * Verify one shot's provenance (roadmap R2). Turns *declared* C2PA/watermark
   * into *verified*: when `assetRef` points at real bytes and the ContentAuth
   * c2patool is available, it runs the real cryptographic verification and
   * persists the result back onto the shot's `ShotProvenance` (c2pa.valid +
   * watermark.detectable), so Trust / Delivery / the E&O pack reflect proof, not
   * a claim. With no asset it falls back to the declared-provenance adapter.
   */
  async verifyShotProvenance(
    shotId: string,
    assetRef?: string | null,
  ): Promise<{ verification: ProvenanceVerification; persisted: boolean } | null> {
    const declared = await this.ctx.storage.getProvenance(shotId);
    if (!declared) return null;

    const useLive = !!assetRef && c2patoolAvailable();
    const port = useLive ? new C2paToolProvenanceAdapter() : this.ctx.provenance;
    const verification = await port.verify({ shot_id: shotId, asset_ref: assetRef ?? null, declared });

    let persisted = false;
    if (useLive) {
      // Fold the verified result back onto the declared provenance.
      const updated = {
        ...declared,
        c2pa: {
          present: verification.c2pa.present,
          valid: verification.c2pa.verified,
          manifest_uri: declared.c2pa?.manifest_uri ?? null,
        },
        watermark: {
          present: verification.watermark.detected || declared.watermark.present,
          method: verification.watermark.detected ? verification.watermark.method : declared.watermark.method,
          detectable: verification.watermark.detected,
        },
      };
      await this.ctx.storage.putProvenance(updated);
      persisted = true;
    }
    return { verification, persisted };
  }

  /** Reconcile incidents for a production against its current findings (C.3 Flow B). */
  async sweepIncidents(pid: string) {
    return this.ctx.incidents.sweep(pid, await this.tau(pid));
  }

  async budget(pid: string) {
    const p = await this.ctx.storage.getProduction(pid);
    if (!p) return null;
    return { ...evaluateBudget(p.spend, p.settings.cost_caps), spend: p.spend, kill_switch: p.kill_switch };
  }

  /** Toggle the loop kill switch (F.1; Producer/SRE only — E.12). */
  async setKillSwitch(pid: string, engaged: boolean): Promise<{ kill_switch: boolean } | null> {
    const p = await this.ctx.storage.getProduction(pid);
    if (!p) return null;
    await this.ctx.storage.putProduction({ ...p, kill_switch: engaged });
    const scenes = await this.ctx.storage.listScenes(pid);
    for (const s of scenes) {
      const v = await this.sceneVerdict(s.scene_id);
      if (v) this.ctx.events.emitSse({ type: "verdict.changed", data: v });
    }
    this.ctx.events.emitSse({
      type: "system.degraded",
      data: { component: "loop", mode: engaged ? "kill_switch" : "resumed" },
    });
    return { kill_switch: engaged };
  }

  /** Bounded auto-remediation for a finding (spec §6). */
  async remediateFinding(fid: string, opts: { manual?: boolean } = {}) {
    return this.ctx.loop.remediateFinding(fid, opts);
  }

  /** Flow B for a whole scene: HELD → regen ≤2 per finding → LOCKED → certificate signs. */
  async autoRemediateScene(sceneId: string) {
    const out = await this.ctx.loop.remediateScene(sceneId);
    let certificate = null;
    if (out.verdict?.verdict === "LOCKED") {
      certificate = await this.certifyScene(sceneId).catch(() => null);
    }
    return { ...out, certificate };
  }

  /**
   * Supervisor slice: run media-processor + BOTH gates (clearance, continuity)
   * across a scene's shots and replace the scene's shot-stage gate findings with
   * the freshly computed ones. Pre-flight findings are left untouched.
   * Recomputes the verdict and emits SSE.
   */
  async rerunGates(sceneId: string): Promise<{
    shots: number;
    findings: number;
    verdict: SceneVerdict | null;
  }> {
    const scene = await this.ctx.storage.getScene(sceneId);
    if (!scene) throw new Error(`unknown scene ${sceneId}`);
    const shots = await this.ctx.storage.listShots(sceneId);

    const fresh: Finding[] = [];
    for (const shot of shots) {
      await this.ctx.mediaProcessor.process(shot.shot_id);
      fresh.push(...(await this.ctx.gateClearance.runShot(shot.shot_id)).findings);
      fresh.push(...(await this.ctx.gateContinuity.runShot(shot.shot_id)).findings);
    }

    const existing = await this.ctx.storage.listFindings(scene.production_id, { scene: sceneId });
    for (const f of existing) {
      if ((f.gate === "clearance" || f.gate === "continuity") && f.stage === "shot") {
        await this.ctx.storage.deleteFinding(f.finding_id);
      }
    }
    for (const f of fresh) await this.ctx.storage.putFinding(f);

    await this.ctx.incidents.sweep(scene.production_id, await this.tau(scene.production_id));

    const verdict = await this.sceneVerdict(sceneId);
    if (verdict) this.ctx.events.emitSse({ type: "verdict.changed", data: verdict });
    return { shots: shots.length, findings: fresh.length, verdict };
  }

  /** POST /entities/:eid/state — planner/MCP proposes a state (F.1). */
  async proposeState(
    eid: string,
    input: { state: string; scene: string; shot?: string | null; evidence_uri?: string | null; by: string },
  ) {
    const res = await this.ctx.archivist.recordObservedState({
      entity_id: eid,
      observed_state: input.state,
      scene: input.scene,
      shot: input.shot ?? null,
      actor: input.by,
      evidence_uri: input.evidence_uri ?? null,
    });
    return res;
  }

  /**
   * POST /findings/:fid/adjudication (F.1, B.2, D12). Appends an immutable
   * adjudication, transitions the finding, recomputes the verdict, emits SSE.
   */
  async adjudicate(
    fid: string,
    input: { decision: Adjudication["decision"]; reason: string; by: string; role: string },
  ): Promise<
    | { ok: true; adjudication: Adjudication; finding: Finding; verdict: SceneVerdict | null }
    | { ok: false; code: number; error: string }
  > {
    const f = await this.ctx.storage.getFinding(fid);
    if (!f) return { ok: false, code: 404, error: "finding not found" };

    const production_id = (await this.ctx.storage.getScene(f.scene_id))?.production_id ?? "";
    const tau = await this.tau(production_id);
    const blockingHigh = computeBlocking(f, tau) && f.severity === "high";

    if (input.decision === "waive") {
      if (input.reason.trim().length < 20)
        return { ok: false, code: 422, error: "waiver reason must be >= 20 characters (D12)" };
      if (blockingHigh && !["producer", "legal"].includes(input.role))
        return {
          ok: false,
          code: 403,
          error: "waiving a blocking HIGH finding requires Producer or Legal (D12)",
        };
    }

    const nextStatus: Finding["status"] =
      input.decision === "waive" ? "waived" : "resolved";

    const adjudication: Adjudication = {
      adjudication_id: this.ctx.ids.next("adj"),
      finding_id: fid,
      by: input.by,
      decision: input.decision,
      reason: input.reason,
      at: this.ctx.clock.now(),
    };
    await this.ctx.storage.appendAdjudication(adjudication);
    const updated: Finding = { ...f, status: nextStatus, adjudication };
    await this.ctx.storage.putFinding(updated);

    const production_id2 = (await this.ctx.storage.getScene(f.scene_id))?.production_id ?? "";
    if (production_id2) await this.ctx.incidents.sweep(production_id2, tau);

    const verdict = await this.sceneVerdict(f.scene_id);
    this.ctx.events.emitSse({
      type: "finding.updated",
      data: { findingId: fid, patch: { status: nextStatus, adjudication } },
    });
    if (verdict) this.ctx.events.emitSse({ type: "verdict.changed", data: verdict });

    return {
      ok: true,
      adjudication,
      finding: this.withBlocking([updated], tau)[0]!,
      verdict,
    };
  }
}
