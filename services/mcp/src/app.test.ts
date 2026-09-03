import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { Archivist } from "@scenelock/archivist";
import { buildContext } from "@scenelock/api/context";
import { DEMO_MCP_TOKEN } from "@scenelock/fixtures";
import { buildMcp } from "./app.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let app: FastifyInstance;
let storage: InMemoryStorage;
const AUTH = { authorization: `Bearer ${DEMO_MCP_TOKEN}` };

async function rpc(method: string, params?: unknown, headers: Record<string, string> = AUTH) {
  const r = await app.inject({
    method: "POST",
    url: "/mcp",
    headers,
    payload: { jsonrpc: "2.0", id: 1, method, params },
  });
  return { status: r.statusCode, body: r.json() as { result?: any; error?: any } };
}
const call = (name: string, args?: unknown, headers?: Record<string, string>) =>
  rpc("tools/call", { name, arguments: args ?? {} }, headers);

beforeEach(async () => {
  const clock = new FixedClock("2026-08-29T16:00:00.000Z");
  storage = new InMemoryStorage();
  await storage.reset();
  const events = new InMemoryEventBus(() => clock.now());
  const ids = new SeqIdGen();
  app = buildMcp(
    buildContext({ clock, storage, events, ids, archivist: new Archivist({ storage, clock, ids, events }) }),
  );
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

describe("@scenelock/mcp — protocol", () => {
  it("rejects an unauthenticated call", async () => {
    const { status, body } = await rpc("initialize", {}, {});
    expect(status).toBe(401);
    expect(body.error.code).toBe(-32001);
  });

  it("initialize returns protocol + server info", async () => {
    const { body } = await rpc("initialize", {});
    expect(body.result.protocolVersion).toBeDefined();
    expect(body.result.serverInfo.name).toBe("radar-mcp");
  });

  it("tools/list advertises the §9 catalog with scopes", async () => {
    const { body } = await rpc("tools/list");
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "check_scene",
        "query_world_state",
        "propose_state_update",
        "request_lock",
        "submit_adjudication",
        "fetch_certificate",
        "list_productions",
        "get_verdict",
        "list_findings",
      ]),
    );
    const cs = body.result.tools.find((t: { name: string }) => t.name === "check_scene");
    expect(cs._meta.scope).toBe("findings:read");
  });
});

describe("@scenelock/mcp — tools", () => {
  it("check_scene returns findings + gate runs + verdict preview", async () => {
    const { body } = await call("check_scene", { shots: ["shot_3", "shot_4"] });
    const out = body.result.structuredContent;
    expect(out.verdict_preview).toBe("HELD");
    expect(out.findings.length).toBeGreaterThan(0);
    expect(out.gate_runs.length).toBeGreaterThan(0);
    expect(body.result.content[0].type).toBe("text");
  });

  it("query_world_state returns canonical facts filtered by text", async () => {
    const { body } = await call("query_world_state", { project_id: "p_dry", entity_query: "cola" });
    const ids = body.result.structuredContent.facts.map((f: { entity_id: string }) => f.entity_id);
    expect(ids).toContain("SC12-PROP-CAN-01");
  });

  it("propose_state_update records a candidate transition", async () => {
    const { body } = await call("propose_state_update", {
      entity_id: "SC12-PROP-CAN-01",
      state: "removed",
      scene: "sc_12",
      shot: "shot_6",
      evidence: "gs://radar-dev-org-org_demo/evidence/x.png",
    });
    expect(body.result.structuredContent.event.canonical).toBe(false);
    expect(["ok", "skip", "regression"]).toContain(body.result.structuredContent.transition);
  });

  it("request_lock returns the verdict + blocking findings", async () => {
    const { body } = await call("request_lock", { scene_id: "sc_12" });
    expect(body.result.structuredContent.verdict.verdict).toBe("HELD");
    expect(body.result.structuredContent.blocking_findings.length).toBe(3);
  });

  it("submit_adjudication is refused — demo token lacks adjudicate:write", async () => {
    const { body } = await call("submit_adjudication", {
      finding_id: "f_identity_drift",
      decision: "confirm",
      reason: "ok",
      user_context: { user_id: "u_1" },
    });
    expect(body.error.code).toBe(-32003);
    expect(body.error.message).toMatch(/scope/);
  });

  it("unknown tool → method-not-found style error", async () => {
    const { body } = await call("do_the_thing", {});
    expect(body.error.code).toBe(-32601);
  });

  it("every call lands in the append-only audit log with a params hash", async () => {
    await call("check_scene", { shots: ["shot_1"] });
    await call("list_productions");
    await call("submit_adjudication", { finding_id: "x", decision: "confirm", reason: "y", user_context: { user_id: "u" } });
    const audit = await storage.listAuditEntries("org_demo");
    expect(audit.length).toBe(3);
    expect(audit.every((e) => e.principal === "radar_demo_" && /^[0-9a-f]{64}$/.test(e.params_hash!))).toBe(true);
    expect(audit.some((e) => e.action === "mcp.submit_adjudication" && e.meta.denied === "scope")).toBe(true);
  });

  it("token last_used_at is stamped", async () => {
    await call("get_verdict", { scene_id: "sc_12" });
    const tok = (await storage.listApiTokens("org_demo"))[0]!;
    expect(tok.last_used_at).not.toBeNull();
  });
});

describe("@scenelock/mcp — VULN-1 regression: adjudicate:write cannot self-declare an elevated role", () => {
  const PLAIN_TOKEN = "test_plain_adjudicate_write_only";
  const PLAIN_AUTH = { authorization: `Bearer ${PLAIN_TOKEN}` };

  beforeEach(async () => {
    // a token with adjudicate:write but NOT adjudicate:waive_high — the scope
    // that (post-fix) is the only thing allowed to authorize a HIGH-severity
    // blocking waiver. Before the fix, this token could reach "producer"
    // authority just by putting role:"producer" in user_context.
    await storage.putApiToken({
      token_id: "tok_test_plain",
      org_id: "org_demo",
      name: "test — adjudicate:write only",
      hash: sha256(PLAIN_TOKEN),
      prefix: "test_plain_",
      scopes: ["adjudicate:write", "findings:read"],
      created_by: "test",
      created_at: "2026-08-25T00:00:00.000Z",
      last_used_at: null,
      revoked: false,
    });
  });

  it("claiming user_context.role:\"producer\" does NOT grant authority to waive a blocking HIGH finding", async () => {
    const { body } = await call(
      "submit_adjudication",
      {
        finding_id: "f_real_person", // HIGH severity, blocking in the seed
        decision: "waive",
        reason: "forged role claim — should still be refused (D12)",
        user_context: { user_id: "attacker", role: "producer" },
      },
      PLAIN_AUTH,
    );
    // the tool call itself succeeds (scope check passes — it has adjudicate:write),
    // but the underlying adjudicate() call must still refuse: real authority is
    // "qa_reviewer" regardless of the claimed role.
    expect(body.error).toBeTruthy();
    expect(body.error.message).toMatch(/producer or legal/i);
  });

  it("the SAME token, WITH adjudicate:waive_high granted, CAN waive the blocking HIGH finding", async () => {
    await storage.putApiToken({
      token_id: "tok_test_elevated",
      org_id: "org_demo",
      name: "test — adjudicate:waive_high granted",
      hash: sha256("test_elevated_token"),
      prefix: "test_elevated_",
      scopes: ["adjudicate:write", "adjudicate:waive_high", "findings:read"],
      created_by: "test",
      created_at: "2026-08-25T00:00:00.000Z",
      last_used_at: null,
      revoked: false,
    });
    const { body } = await call(
      "submit_adjudication",
      {
        finding_id: "f_real_person",
        decision: "waive",
        reason: "legitimately elevated token — should succeed (D12)",
        user_context: { user_id: "legal_head" },
      },
      { authorization: "Bearer test_elevated_token" },
    );
    expect(body.result).toBeTruthy();
    expect(body.result.structuredContent.finding.status).toBe("waived");
  });
});
