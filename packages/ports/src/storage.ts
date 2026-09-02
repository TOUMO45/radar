import {
  getDryRunStore,
  type DryRunStore,
} from "@scenelock/fixtures";
import type {
  Adjudication,
  ApiToken,
  Attempt,
  AuditEntry,
  Certificate,
  ComplianceProfile,
  ConsentRecord,
  Directive,
  Entity,
  Finding,
  Incident,
  KgNode,
  MediaArtifacts,
  Production,
  Scene,
  SceneBenchScorecard,
  Shot,
  ShotContinuity,
  ShotProvenance,
  ShotText,
  StateEvent,
} from "@scenelock/schema";

/**
 * System-of-record seam (spec E.7). The in-memory adapter below stands in for
 * Firestore. A FirestoreStorage adapter implements this same interface later;
 * the org-scoped document paths from E.7 map onto these collection methods.
 *
 * Everything is async so the Firestore swap is a drop-in.
 */
export interface FindingFilter {
  scene?: string;
  gate?: string;
  risk_class?: string;
  status?: string;
  source?: string;
  stage?: string;
  shot?: string;
  blocking?: boolean;
}

export interface StoragePort {
  // productions
  listProductions(orgId: string): Promise<Production[]>;
  getProduction(pid: string): Promise<Production | null>;
  putProduction(p: Production): Promise<void>;

  // scenes / shots
  listScenes(pid: string): Promise<Scene[]>;
  getScene(sid: string): Promise<Scene | null>;
  putScene(s: Scene): Promise<void>;
  listShots(sceneId: string): Promise<Shot[]>;
  getShot(shotId: string): Promise<Shot | null>;
  putShot(s: Shot): Promise<void>;
  putMediaArtifacts(a: MediaArtifacts): Promise<void>;
  getMediaArtifacts(shotId: string): Promise<MediaArtifacts | null>;

  // findings + immutable adjudications
  listFindings(pid: string, f?: FindingFilter): Promise<Finding[]>;
  getFinding(fid: string): Promise<Finding | null>;
  putFinding(f: Finding): Promise<void>;
  /** Remove a finding. Production keeps findings for audit; used here only to
   *  clear DRY_RUN seed placeholders before a real gate re-run (P2). */
  deleteFinding(fid: string): Promise<void>;
  listAdjudications(fid: string): Promise<Adjudication[]>;
  appendAdjudication(a: Adjudication): Promise<void>;

  // world state
  listEntities(pid: string): Promise<Entity[]>;
  getEntity(eid: string): Promise<Entity | null>;
  putEntity(e: Entity): Promise<void>;
  listStateEvents(entityId?: string): Promise<StateEvent[]>;
  appendStateEvent(ev: StateEvent): Promise<void>;

  // loop
  listDirectives(pid: string): Promise<Directive[]>;
  getDirective(did: string): Promise<Directive | null>;
  putDirective(d: Directive): Promise<void>;
  listAttempts(pid: string): Promise<Attempt[]>;
  putAttempt(a: Attempt): Promise<void>;

  // clearance knowledge graph + consent registry (spec §11, G-03)
  listKg(kind?: KgNode["kind"]): Promise<KgNode[]>;
  listConsentRecords(pid: string): Promise<ConsentRecord[]>;
  putConsentRecord(r: ConsentRecord): Promise<void>;
  getDialogue(shotId: string): Promise<ShotText | null>;
  /** overwrite a shot's script/audio/ocr text — used when a regen changes it (P4). */
  putDialogue(shotId: string, text: ShotText): Promise<void>;

  // continuity gate inputs (spec E.5.1)
  getContinuity(shotId: string): Promise<ShotContinuity | null>;
  putContinuity(shotId: string, obs: ShotContinuity): Promise<void>;

  // synthetic-media compliance & provenance (Radar 2026 extension)
  getProvenance(shotId: string): Promise<ShotProvenance | null>;
  putProvenance(p: ShotProvenance): Promise<void>;
  getComplianceProfile(pid: string): Promise<ComplianceProfile | null>;
  putComplianceProfile(p: ComplianceProfile): Promise<void>;

  // MCP tokens + audit log (E.6, E.7)
  listApiTokens(orgId: string): Promise<ApiToken[]>;
  getApiTokenByHash(hash: string): Promise<ApiToken | null>;
  putApiToken(t: ApiToken): Promise<void>;
  appendAuditEntry(e: AuditEntry): Promise<void>;
  listAuditEntries(orgId: string, limit?: number): Promise<AuditEntry[]>;

  // incidents (C.3 Flow B, E.11)
  listIncidents(pid: string): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
  putIncident(i: Incident): Promise<void>;

  // certificates (§8, E.7) + SceneBench (§10)
  listCertificates(pid: string): Promise<Certificate[]>;
  getCertificate(id: string): Promise<Certificate | null>;
  getCertificateBySlug(slug: string): Promise<Certificate | null>;
  putCertificate(c: Certificate): Promise<void>;
  getScorecard(): Promise<SceneBenchScorecard | null>;
  putScorecard(s: SceneBenchScorecard): Promise<void>;

  /** test helper — reload the DRY_RUN seed. Not part of the Firestore adapter. */
  reset(): Promise<void>;
}

function matchesFilter(f: Finding, flt: FindingFilter): boolean {
  if (flt.scene && f.scene_id !== flt.scene) return false;
  if (flt.gate && f.gate !== flt.gate) return false;
  if (flt.risk_class && f.risk_class !== flt.risk_class) return false;
  if (flt.status && f.status !== flt.status) return false;
  if (flt.source && f.source !== flt.source) return false;
  if (flt.stage && f.stage !== flt.stage) return false;
  if (flt.shot && f.shot_id !== flt.shot) return false;
  if (flt.blocking !== undefined && f.blocking !== flt.blocking) return false;
  return true;
}

export class InMemoryStorage implements StoragePort {
  private d: DryRunStore;
  private adjudications: Adjudication[] = [];
  private media = new Map<string, MediaArtifacts>();
  private audit: AuditEntry[] = [];
  private incidents = new Map<string, Incident>();
  private certificates = new Map<string, Certificate>();
  private scorecard: SceneBenchScorecard | null = null;

  constructor(seed: DryRunStore = getDryRunStore()) {
    this.d = seed;
    this.hydrateAdjudications();
  }

  async reset(): Promise<void> {
    this.d = getDryRunStore();
    this.adjudications = [];
    this.media.clear();
    this.audit = [];
    this.incidents.clear();
    this.certificates.clear();
    this.scorecard = null;
    this.hydrateAdjudications();
  }

  private hydrateAdjudications() {
    for (const f of this.d.findings) if (f.adjudication) this.adjudications.push(f.adjudication);
  }

  async listProductions(orgId: string) {
    return this.d.production.org_id === orgId ? [this.d.production] : [];
  }
  async getProduction(pid: string) {
    return this.d.production.production_id === pid ? this.d.production : null;
  }
  async putProduction(p: Production) {
    this.d.production = p;
  }

  async listScenes(pid: string) {
    return this.d.production.production_id === pid ? [this.d.scene] : [];
  }
  async getScene(sid: string) {
    return this.d.scene.scene_id === sid ? this.d.scene : null;
  }
  async putScene(s: Scene) {
    if (this.d.scene.scene_id === s.scene_id) this.d.scene = s;
  }
  async listShots(sceneId: string) {
    return this.d.scene.scene_id === sceneId ? this.d.shots : [];
  }
  async getShot(shotId: string) {
    return this.d.shots.find((s) => s.shot_id === shotId) ?? null;
  }
  async putShot(s: Shot) {
    const i = this.d.shots.findIndex((x) => x.shot_id === s.shot_id);
    if (i >= 0) this.d.shots[i] = s;
    else this.d.shots.push(s);
  }
  async putMediaArtifacts(a: MediaArtifacts) {
    this.media.set(a.shot_id, a);
  }
  async getMediaArtifacts(shotId: string) {
    return this.media.get(shotId) ?? null;
  }

  async listFindings(pid: string, f: FindingFilter = {}) {
    if (this.d.production.production_id !== pid) return [];
    return this.d.findings.filter((x) => matchesFilter(x, f));
  }
  async getFinding(fid: string) {
    return this.d.findings.find((x) => x.finding_id === fid) ?? null;
  }
  async putFinding(f: Finding) {
    const i = this.d.findings.findIndex((x) => x.finding_id === f.finding_id);
    if (i >= 0) this.d.findings[i] = f;
    else this.d.findings.push(f);
  }
  async deleteFinding(fid: string) {
    this.d.findings = this.d.findings.filter((x) => x.finding_id !== fid);
  }
  async listAdjudications(fid: string) {
    return this.adjudications.filter((a) => a.finding_id === fid);
  }
  async appendAdjudication(a: Adjudication) {
    this.adjudications.push(a); // append-only (B.2)
  }

  async listEntities(pid: string) {
    return this.d.production.production_id === pid ? this.d.entities : [];
  }
  async getEntity(eid: string) {
    return this.d.entities.find((e) => e.entity_id === eid) ?? null;
  }
  async putEntity(e: Entity) {
    const i = this.d.entities.findIndex((x) => x.entity_id === e.entity_id);
    if (i >= 0) this.d.entities[i] = e;
    else this.d.entities.push(e);
  }
  async listStateEvents(entityId?: string) {
    const all = [...this.d.stateEvents].sort((a, b) => a.ts.localeCompare(b.ts));
    return entityId ? all.filter((ev) => ev.entity_id === entityId) : all;
  }
  async appendStateEvent(ev: StateEvent) {
    this.d.stateEvents.push(ev); // immutable log (B.2)
  }

  async listDirectives(pid: string) {
    return this.d.production.production_id === pid ? this.d.directives : [];
  }
  async getDirective(did: string) {
    return this.d.directives.find((x) => x.directive_id === did) ?? null;
  }
  async putDirective(dir: Directive) {
    const i = this.d.directives.findIndex((x) => x.directive_id === dir.directive_id);
    if (i >= 0) this.d.directives[i] = dir;
    else this.d.directives.push(dir);
  }
  async listAttempts(pid: string) {
    return this.d.production.production_id === pid ? this.d.attempts : [];
  }
  async putAttempt(a: Attempt) {
    const i = this.d.attempts.findIndex(
      (x) => x.directive_id === a.directive_id && x.attempt_no === a.attempt_no,
    );
    if (i >= 0) this.d.attempts[i] = a;
    else this.d.attempts.push(a);
  }

  async listKg(kind?: KgNode["kind"]) {
    return kind ? this.d.kg.filter((n) => n.kind === kind) : this.d.kg;
  }
  async listConsentRecords(pid: string) {
    return this.d.production.production_id === pid ? this.d.consentRecords : [];
  }
  async putConsentRecord(r: ConsentRecord) {
    const i = this.d.consentRecords.findIndex((x) => x.record_id === r.record_id);
    if (i >= 0) this.d.consentRecords[i] = r;
    else this.d.consentRecords.push(r);
  }
  async getDialogue(shotId: string) {
    return this.d.dialogue[shotId] ?? null;
  }
  async putDialogue(shotId: string, text: ShotText) {
    this.d.dialogue[shotId] = text;
  }
  async getContinuity(shotId: string) {
    return this.d.continuity[shotId] ?? null;
  }
  async putContinuity(shotId: string, obs: ShotContinuity) {
    this.d.continuity[shotId] = obs;
  }

  async getProvenance(shotId: string) {
    return this.d.provenance?.[shotId] ?? null;
  }
  async putProvenance(p: ShotProvenance) {
    (this.d.provenance ??= {})[p.shot_id] = p;
  }
  async getComplianceProfile(pid: string) {
    if (this.d.production.production_id !== pid) return null;
    return this.d.complianceProfile ?? null;
  }
  async putComplianceProfile(p: ComplianceProfile) {
    this.d.complianceProfile = p;
  }

  async listApiTokens(orgId: string) {
    return this.d.apiTokens.filter((t) => t.org_id === orgId);
  }
  async getApiTokenByHash(hash: string) {
    return this.d.apiTokens.find((t) => t.hash === hash && !t.revoked) ?? null;
  }
  async putApiToken(t: ApiToken) {
    const i = this.d.apiTokens.findIndex((x) => x.token_id === t.token_id);
    if (i >= 0) this.d.apiTokens[i] = t;
    else this.d.apiTokens.push(t);
  }
  async appendAuditEntry(e: AuditEntry) {
    this.audit.push(e); // append-only (E.10)
  }
  async listAuditEntries(orgId: string, limit = 100) {
    return this.audit
      .filter((e) => e.org_id === orgId)
      .slice(-limit)
      .reverse();
  }

  async listIncidents(pid: string) {
    return [...this.incidents.values()]
      .filter((i) => i.production_id === pid)
      .sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  }
  async getIncident(id: string) {
    return this.incidents.get(id) ?? null;
  }
  async putIncident(i: Incident) {
    this.incidents.set(i.incident_id, i);
  }

  async listCertificates(pid: string) {
    return [...this.certificates.values()]
      .filter((c) => c.production_id === pid)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async getCertificate(id: string) {
    return this.certificates.get(id) ?? null;
  }
  async getCertificateBySlug(slug: string) {
    return [...this.certificates.values()].find((c) => c.slug === slug) ?? null;
  }
  async putCertificate(c: Certificate) {
    this.certificates.set(c.certificate_id, c);
  }
  async getScorecard() {
    return this.scorecard;
  }
  async putScorecard(s: SceneBenchScorecard) {
    this.scorecard = s;
  }
}
