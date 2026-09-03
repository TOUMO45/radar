import type { Services } from "@scenelock/api/services";
import type { Archivist } from "@scenelock/archivist";
import type { StoragePort } from "@scenelock/ports";
import type { McpScope } from "@scenelock/schema";
import type { Principal } from "./auth.js";

export interface ToolDeps {
  services: Services;
  archivist: Archivist;
  storage: StoragePort;
}

export interface ToolDef {
  name: string;
  description: string;
  scope: McpScope;
  inputSchema: Record<string, unknown>; // JSON Schema (draft 2020-12 subset)
  handler: (deps: ToolDeps, args: Record<string, unknown>, principal: Principal) => Promise<unknown>;
}

class ToolError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !v) throw new ToolError(-32602, `"${name}" must be a non-empty string`);
  return v;
};
const strArr = (v: unknown, name: string): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new ToolError(-32602, `"${name}" must be a string[]`);
  return v as string[];
};

export const TOOLS: ToolDef[] = [
  {
    name: "check_scene",
    description:
      "Run the QA gates' current view for a set of shots: findings, gate runs, and a verdict preview for their scene.",
    scope: "findings:read",
    inputSchema: {
      type: "object",
      required: ["shots"],
      properties: {
        shots: { type: "array", items: { type: "string" }, description: "shot ids" },
        world_state_hint: { type: "string", description: "optional scene id / hint" },
      },
    },
    handler: async ({ services, storage }, args) => {
      const shots = strArr(args.shots, "shots");
      let sceneId = typeof args.world_state_hint === "string" ? args.world_state_hint : "";
      if (!sceneId) {
        const first = await storage.getShot(shots[0] ?? "");
        sceneId = first?.scene_id ?? "";
      }
      if (!sceneId) throw new ToolError(-32602, "could not resolve a scene for those shots");
      const scene = await storage.getScene(sceneId);
      if (!scene) throw new ToolError(-32004, `unknown scene ${sceneId}`);
      const findings = (await services.listFindings(scene.production_id, { scene: sceneId })).filter(
        (f) => f.shot_id === null || shots.includes(f.shot_id),
      );
      const gate_runs = (await Promise.all(shots.map((s) => storage.getShot(s))))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .flatMap((s) => s.gate_runs);
      const verdict = await services.sceneVerdict(sceneId);
      return { findings, gate_runs, verdict_preview: verdict?.verdict ?? null, verdict };
    },
  },
  {
    name: "query_world_state",
    description: "Canonical World State facts for planning / generation conditioning.",
    scope: "world_state:read",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        entity_query: { type: "string", description: "substring over canonical_desc / facts" },
      },
    },
    handler: async ({ archivist }, args) => {
      const facts = await archivist.queryWorldState(str(args.project_id, "project_id"), {
        text: typeof args.entity_query === "string" ? args.entity_query : undefined,
      });
      return { facts };
    },
  },
  {
    name: "propose_state_update",
    description:
      "Record a candidate entity state observation with evidence. Becomes canonical only when the scene LOCKs.",
    scope: "world_state:propose",
    inputSchema: {
      type: "object",
      required: ["entity_id", "state", "scene"],
      properties: {
        entity_id: { type: "string" },
        state: { type: "string" },
        scene: { type: "string" },
        shot: { type: "string" },
        evidence: { type: "string", description: "evidence uri or note" },
      },
    },
    handler: async ({ archivist }, args, principal) => {
      const res = await archivist.recordObservedState({
        entity_id: str(args.entity_id, "entity_id"),
        observed_state: str(args.state, "state"),
        scene: str(args.scene, "scene"),
        shot: typeof args.shot === "string" ? args.shot : null,
        actor: `mcp:${principal.prefix}`,
        evidence_uri: typeof args.evidence === "string" ? args.evidence : null,
      });
      return { transition: res.verdict, event: res.event, entity: res.entity };
    },
  },
  {
    name: "request_lock",
    description: "Return the current verdict for a scene plus the open blocking findings holding it.",
    scope: "findings:read",
    inputSchema: {
      type: "object",
      required: ["scene_id"],
      properties: { scene_id: { type: "string" } },
    },
    handler: async ({ services, storage }, args) => {
      const sceneId = str(args.scene_id, "scene_id");
      const scene = await storage.getScene(sceneId);
      if (!scene) throw new ToolError(-32004, `unknown scene ${sceneId}`);
      const verdict = await services.sceneVerdict(sceneId);
      const blocking = (await services.listFindings(scene.production_id, { scene: sceneId })).filter(
        (f) => f.blocking && (f.status === "open" || f.status === "in_remediation" || f.status === "escalated"),
      );
      return { verdict, blocking_findings: blocking };
    },
  },
  {
    name: "submit_adjudication",
    description:
      "Submit a human adjudication (confirm | waive | override). Requires user_context.user_id — a machine cannot sign off as a human. Waiving a blocking HIGH finding additionally requires the token to hold the adjudicate:waive_high scope (D12) — user_context.role is a descriptive label only and is never treated as authority.",
    scope: "adjudicate:write",
    inputSchema: {
      type: "object",
      required: ["finding_id", "decision", "reason", "user_context"],
      properties: {
        finding_id: { type: "string" },
        decision: { type: "string", enum: ["confirm", "waive", "override"] },
        reason: { type: "string" },
        user_context: {
          type: "object",
          required: ["user_id"],
          properties: { user_id: { type: "string" }, role: { type: "string" } },
        },
      },
    },
    // VULN fix (2026-09-03): `role` used to come straight from the caller's
    // own `user_context.role` — any token with adjudicate:write could
    // self-declare role:"producer" and waive a blocking HIGH finding,
    // bypassing D12. Authority now comes ONLY from a scope explicitly granted
    // to the token; the client-supplied role is never consulted for authority.
    handler: async ({ services }, args, principal) => {
      const uc = (args.user_context ?? {}) as { user_id?: string; role?: string };
      if (!uc.user_id) throw new ToolError(-32602, "user_context.user_id is required (E.6)");
      const decision = str(args.decision, "decision") as "confirm" | "waive" | "override";
      const canWaiveHigh = principal.scopes.includes("adjudicate:waive_high");
      const res = await services.adjudicate(str(args.finding_id, "finding_id"), {
        decision,
        reason: typeof args.reason === "string" ? args.reason : "",
        by: uc.user_id,
        role: canWaiveHigh ? "producer" : "qa_reviewer",
      });
      if (!res.ok) throw new ToolError(res.code === 403 ? -32003 : -32602, res.error);
      return { adjudication: res.adjudication, finding: res.finding, verdict: res.verdict };
    },
  },
  {
    name: "fetch_certificate",
    description: "Fetch a scene's signed clearance certificate and its hash chain.",
    scope: "certificates:read",
    inputSchema: {
      type: "object",
      required: ["scene_id"],
      properties: { scene_id: { type: "string" } },
    },
    handler: async ({ services }, args) => {
      const sceneId = str(args.scene_id, "scene_id");
      const s = await services.getScene(sceneId);
      if (!s) throw new ToolError(-32004, `unknown scene ${sceneId}`);
      // certifier is P6 — respond honestly rather than fabricating a certificate
      return {
        scene_id: sceneId,
        status: s.status === "certified" ? "certified" : "not_certified",
        certificate: null,
        chain: [],
        note: "certifier not yet online (P6)",
      };
    },
  },
  {
    name: "list_productions",
    description: "List productions the token's org can see, with verdict rollups.",
    scope: "findings:read",
    inputSchema: { type: "object", properties: {} },
    handler: async ({ services }, _args, principal) => ({
      productions: await services.listProductions(principal.org_id),
    }),
  },
  {
    name: "get_verdict",
    description: "Current verdict + inputs snapshot for a scene.",
    scope: "findings:read",
    inputSchema: {
      type: "object",
      required: ["scene_id"],
      properties: { scene_id: { type: "string" } },
    },
    handler: async ({ services }, args) => {
      const v = await services.sceneVerdict(str(args.scene_id, "scene_id"));
      if (!v) throw new ToolError(-32004, "unknown scene");
      return v;
    },
  },
  {
    name: "list_findings",
    description: "List findings for a production with optional filters.",
    scope: "findings:read",
    inputSchema: {
      type: "object",
      required: ["production_id"],
      properties: {
        production_id: { type: "string" },
        scene: { type: "string" },
        gate: { type: "string" },
        status: { type: "string" },
        blocking: { type: "boolean" },
      },
    },
    handler: async ({ services }, args) => ({
      findings: await services.listFindings(str(args.production_id, "production_id"), {
        scene: typeof args.scene === "string" ? args.scene : undefined,
        gate: typeof args.gate === "string" ? args.gate : undefined,
        status: typeof args.status === "string" ? args.status : undefined,
        blocking: typeof args.blocking === "boolean" ? args.blocking : undefined,
      }),
    }),
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export { ToolError };
