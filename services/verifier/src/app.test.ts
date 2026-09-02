import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { Certifier } from "@scenelock/certifier";
import { buildVerifier } from "./app.js";

let app: FastifyInstance;
let storage: InMemoryStorage;
let certifier: Certifier;
const clock = new FixedClock("2026-08-29T18:30:00.000Z");

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  certifier = new Certifier({ storage, clock, ids: new SeqIdGen(), events: new InMemoryEventBus(() => clock.now()) });
  // lock + certify sc_12
  for (const s of await storage.listShots("sc_12")) {
    await storage.putShot({
      ...s,
      status: "gates_complete",
      c2pa: { present: true, valid: true, manifest_uri: `gs://x/${s.shot_id}/c2pa/manifest.json` },
      gate_runs: [
        { gate: "continuity", sub_gate: null, shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
        { gate: "clearance", sub_gate: null, shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
        { gate: "clearance", sub_gate: "audio", shot_id: s.shot_id, status: "completed", started_at: null, completed_at: null, duration_ms: 1, model_versions: [], error: null },
      ],
    });
  }
  for (const f of await storage.listFindings("p_dry", { scene: "sc_12" })) {
    if (f.stage !== "preflight") await storage.putFinding({ ...f, status: "waived" });
  }
  app = buildVerifier(certifier);
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

describe("@scenelock/verifier — GET /verify/:slug (G-16)", () => {
  it("returns valid + chain_ok for a real certificate, no auth needed", async () => {
    const cert = await certifier.certify("sc_12");
    const r = await app.inject({ method: "GET", url: `/verify/${cert.slug}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      status: "valid",
      chain_ok: true,
      signature_ok: true,
      scene: "sc_12",
      disclaimer: "Attests what was checked and what humans decided. Not a legal opinion.",
    });
  });

  it("returns status unknown for a bogus slug (no leak)", async () => {
    const r = await app.inject({ method: "GET", url: "/verify/does-not-exist" });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("unknown");
  });
});
