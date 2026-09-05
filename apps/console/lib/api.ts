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
// Server components reach the API directly; the browser goes through the BFF
// proxy (/api/*, D.2) so it's same-origin and the role/user context is injected.
const base = () => (typeof window === "undefined" ? BASE : "/api");

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Must match services/api/src/auth.ts DEV_ROLE_TOKENS — same env var names,
// same DEV/DEMO-only defaults (same convention already used by the BFF proxy
// at apps/console/app/api/[...path]/route.ts). Needed here because this page
// fetches server-side, straight to the API — it never goes through that BFF's
// own role-header-to-token mapping.
const PRODUCER_TOKEN = process.env.RADAR_ROLE_TOKEN_PRODUCER ?? "radar_dev_producer_9f2a7c1e";

/** Like `get`, but authenticates as producer — for routes gated after the
 *  2026-09-05 bug-hunt audit (underwriting pack: named subjects + consent
 *  docs, no longer public). */
async function getAsProducer<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${PRODUCER_TOKEN}` },
  });
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

  // E&O / Underwriting Pack (roadmap R1) — gated (producer/legal/sre_admin)
  // since the 2026-09-05 bug-hunt audit; this RSC page has no end-user
  // session of its own, so it authenticates as producer to keep working.
  getUnderwritingPack: (sid: string) =>
    getAsProducer<{ pack: UnderwritingPack }>(`/v1/scenes/${sid}/underwriting-pack`).then((r) => r.pack).catch(() => null),

  // R4 technical delivery
  getTechnicalDelivery: (sid: string) =>
    get<{
      scene_id: string;
      master: Record<string, unknown> | null;
      passed: boolean;
      targets: Array<{ platform: string; label: string; citation: string; passed: boolean; checks: Array<{ param: string; required: string; observed: string; ok: boolean; severity: string }> }>;
      findings: Finding[];
    }>(`/v1/scenes/${sid}/technical-delivery`).catch(() => null),

  // R6 music cue sheet
  getCueSheet: (sid: string) =>
    get<{
      cue_sheet: { scene_id: string; production_title: string; cues: Array<Record<string, unknown>>; total_cues: number; cleared_cues: number; uncleared_cues: number; total_music_ms: number };
      findings: Finding[];
    }>(`/v1/scenes/${sid}/cue-sheet`).catch(() => null),

  // R5 likeness marketplace
  getLikenessOptions: (shotId: string) =>
    get<{ shot_id: string; subject: string | null; replica_kind: string; quotes: Array<{ quote_id: string; provider: string; provider_label: string; scope: string; est_price_usd: number; turnaround_days: number; terms_url: string; eligible: boolean }> }>(
      `/v1/shots/${shotId}/likeness-options`,
    ).catch(() => null),
};

async function post<T>(path: string, body: unknown, role = "producer"): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scenelock-role": role },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const actions = {
  // R5 clear a likeness via a provider
  clearLikeness: (shotId: string, provider: string) =>
    post<{ ok: boolean; compliance_before: number; compliance_after: number; clearance: { consent: { record_id: string; subject: string } } }>(
      `/v1/shots/${shotId}/clear-likeness`,
      { provider },
      "legal",
    ),
  // R7 run the compliance diff over the loop
  complianceDiff: (sid: string) =>
    post<{
      scene_id: string;
      before: { violated_rule_ids: string[]; trust_score: number; trust_band: string };
      after: { violated_rule_ids: string[]; trust_score: number; trust_band: string };
      resolved_rule_ids: string[];
      remaining_rule_ids: string[];
      trust_delta: number;
      verdict: string | null;
      certificate_slug: string | null;
    }>(`/v1/scenes/${sid}/compliance-diff`, {}),
};
