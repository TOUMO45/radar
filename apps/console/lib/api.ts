import type {
  Attempt,
  Certificate,
  ComplianceProfile,
  ConsentRecord,
  DeliveryReadiness,
  Directive,
  Entity,
  Finding,
  Incident,
  Portfolio,
  Production,
  ProductionRollup,
  Scene,
  SceneBenchScorecard,
  SceneVerdict,
  Shot,
  StateEvent,
  TrustScore,
  UnderwritingPack,
  VerifyResult,
} from "@scenelock/schema";

/**
 * P0 data layer. Talks straight to @scenelock/api server-side. The token-handling
 * BFF (D.2) and TanStack Query cache land in M1; for now these are plain server
 * fetches with no-store so the DRY_RUN verdict is always live.
 */
const BASE = process.env.SCENELOCK_API_BASE ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const DEMO_ORG = "org_demo";

export const api = {
  listProductions: (orgId = DEMO_ORG) =>
    get<{ productions: ProductionRollup[] }>(`/v1/orgs/${orgId}/productions`).then(
      (r) => r.productions,
    ),
  getPortfolio: (orgId = DEMO_ORG) =>
    get<{ portfolio: Portfolio }>(`/v1/orgs/${orgId}/portfolio`).then((r) => r.portfolio).catch(() => null),
  getProduction: (pid: string) =>
    get<{ production: Production; verdict: SceneVerdict }>(`/v1/productions/${pid}`),
  listScenes: (pid: string) =>
    get<{ scenes: Scene[] }>(`/v1/productions/${pid}/scenes`).then((r) => r.scenes),
  getScene: (sid: string) => get<{ scene: Scene }>(`/v1/scenes/${sid}`).then((r) => r.scene),
  listShots: (sid: string) =>
    get<{ shots: Shot[] }>(`/v1/scenes/${sid}/shots`).then((r) => r.shots),
  getVerdict: (sid: string) => get<SceneVerdict>(`/v1/scenes/${sid}/verdict`),
  listFindings: (pid: string, qs = "") =>
    get<{ findings: Finding[]; facets: Record<string, Record<string, number>> }>(
      `/v1/productions/${pid}/findings${qs ? `?${qs}` : ""}`,
    ),
  listEntities: (pid: string) =>
    get<{ entities: Entity[] }>(`/v1/productions/${pid}/entities`).then((r) => r.entities),
  getEntity: (eid: string) =>
    get<{ entity: Entity; state_events: StateEvent[] }>(`/v1/entities/${eid}`),
  listConsent: (pid: string) =>
    get<{ records: ConsentRecord[] }>(`/v1/productions/${pid}/consent-records`).then((r) => r.records),
  getLoop: (pid: string) =>
    get<{ directives: Directive[]; attempts: Attempt[]; incidents: Incident[] }>(
      `/v1/productions/${pid}/loop`,
    ),
  getBudget: (pid: string) =>
    get<{
      level: "green" | "warn" | "kill";
      ratio: number;
      detail: Record<"veo_seconds" | "gemini_tokens" | "loop_attempts" | "usd", { spent: number; cap: number }>;
      kill_switch: boolean;
    }>(`/v1/productions/${pid}/budget`),
  getSceneCertificate: (sid: string) =>
    get<{
      certificate: Certificate;
      chain: Array<{ id: string; hash: string; prev: string | null; scene: string }>;
    }>(`/v1/scenes/${sid}/certificate`).catch(() => null),
  getCertificate: (cid: string) =>
    get<{ certificate: Certificate }>(`/v1/certificates/${cid}`).then((r) => r.certificate),
  verify: (slug: string) => get<VerifyResult>(`/verify/${slug}`),
  getBench: () => get<SceneBenchScorecard>(`/v1/bench`).catch(() => null),

  // synthetic-media compliance & trust (Radar 2026 extension)
  getTrustScore: (sid: string) => get<TrustScore>(`/v1/scenes/${sid}/trust-score`).catch(() => null),
  getDeliveryReadiness: (sid: string) =>
    get<DeliveryReadiness>(`/v1/scenes/${sid}/delivery-readiness`).catch(() => null),
  getCompliance: (sid: string) =>
    get<{
      scene_id: string;
      profile: ComplianceProfile;
      findings: Finding[];
      failing_targets: string[];
      by_shot: Record<string, Finding[]>;
    }>(`/v1/scenes/${sid}/compliance`).catch(() => null),

  // E&O / Underwriting Pack (roadmap R1)
  getUnderwritingPack: (sid: string) =>
    get<{ pack: UnderwritingPack }>(`/v1/scenes/${sid}/underwriting-pack`).then((r) => r.pack).catch(() => null),
};
