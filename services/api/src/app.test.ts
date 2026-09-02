import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { Archivist } from "@scenelock/archivist";
import { buildApp } from "./app.js";
import { buildContext } from "./context.js";

let app: FastifyInstance;

beforeEach(async () => {
  const clock = new FixedClock("2026-08-29T15:00:00.000Z");
  const storage = new InMemoryStorage();
  const events = new InMemoryEventBus(() => clock.now());
  const ids = new SeqIdGen();
  const ctx = buildContext({
    clock,
    storage,
    events,
    ids,
    archivist: new Archivist({ storage, clock, ids, events }),
  });
  app = buildApp(ctx);
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

describe("@scenelock/api — F.1 surface (P0 carry-over)", () => {
  it("GET /health reports dry_run mode", async () => {
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.json()).toMatchObject({ status: "ok", mode: "dry_run" });
  });

  it("GET /v1/orgs/:orgId/productions returns the seeded rollup", async () => {
    const body = (await app.inject({ method: "GET", url: "/v1/orgs/org_demo/productions" })).json();
    expect(body.productions[0].production.production_id).toBe("p_dry");
    expect(body.productions[0].open_blocking).toBe(3);
  });

  it("GET /v1/scenes/:sid/verdict computes HELD with 3 blocking", async () => {
    const v = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/verdict" })).json();
    expect(v.verdict).toBe("HELD");
    expect(v.reason).toBe("open_blocking_findings");
    expect(v.inputs.blocking_open).toBe(3);
  });

  it("filters findings by blocking", async () => {
    const body = (
      await app.inject({
        method: "GET",
        url: "/v1/productions/p_dry/findings?blocking=true&stage=shot",
      })
    ).json();
    expect(body.findings.map((f: { finding_id: string }) => f.finding_id).sort()).toEqual([
      "f_ai_disclosure",
      "f_can_teleport",
      "f_real_person",
    ]);
  });

  it("GET /v1/findings/:fid includes directive + attempts + adjudications", async () => {
    const body = (await app.inject({ method: "GET", url: "/v1/findings/f_can_teleport" })).json();
    expect(body.directive.directive_id).toBe("dir_can_01");
    expect(body.attempts).toHaveLength(1);
    expect(body.adjudications).toEqual([]);
  });

  it("blocks a QA reviewer from waiving a blocking HIGH (D12)", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/findings/f_real_person/adjudication",
      headers: { "x-scenelock-role": "qa_reviewer" },
      payload: { decision: "waive", reason: "cleared with legal, license on file ref 4417-EU" },
    });
    expect(r.statusCode).toBe(403);
  });

  it("rejects a waiver reason under 20 chars (D12)", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/findings/f_identity_drift/adjudication",
      headers: { "x-scenelock-role": "producer" },
      payload: { decision: "waive", reason: "looks fine" },
    });
    expect(r.statusCode).toBe(422);
  });

  it("Producer waives all 3 blocking findings → verdict flips to c2pa-only", async () => {
    for (const fid of ["f_can_teleport", "f_real_person", "f_ai_disclosure"]) {
      const r = await app.inject({
        method: "POST",
        url: `/v1/findings/${fid}/adjudication`,
        headers: { "x-scenelock-role": "producer" },
        payload: { decision: "waive", reason: `waived for demo — documented rationale for ${fid}` },
      });
      expect(r.statusCode).toBe(201);
    }
    const v = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/verdict" })).json();
    expect(v.inputs.blocking_open).toBe(0);
    expect(v.reason).toBe("incomplete_c2pa_coverage");
  });

  it("adjudication persists (immutable) and shows on the finding", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/findings/f_identity_drift/adjudication",
      headers: { "x-scenelock-role": "qa_reviewer" },
      payload: { decision: "confirm", reason: "regen conditioned on Riya ref set — acceptable" },
    });
    const body = (await app.inject({ method: "GET", url: "/v1/findings/f_identity_drift" })).json();
    expect(body.finding.status).toBe("resolved");
    expect(body.adjudications).toHaveLength(1);
    expect(body.adjudications[0].decision).toBe("confirm");
  });
});

describe("@scenelock/api — P1 World State routes", () => {
  it("GET /v1/entities/:eid returns the entity + its state_events", async () => {
    const body = (await app.inject({ method: "GET", url: "/v1/entities/SC12-PROP-CAN-01" })).json();
    expect(body.entity.type).toBe("prop");
    expect(Array.isArray(body.state_events)).toBe(true);
    expect(body.state_events.length).toBeGreaterThan(0);
  });

  it("POST /v1/productions/:pid/entities registers a planned entity", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/productions/p_dry/entities",
      payload: {
        entity_id: "SC12-PROP-MUG-01",
        type: "prop",
        canonical_desc: "chipped enamel mug",
        expected_state: "introduced",
        scene: "sc_12",
        shot: "shot_2",
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().entity.status).toBe("planned");

    const ws = (
      await app.inject({
        method: "GET",
        url: "/v1/productions/p_dry/world-state?status=planned",
      })
    ).json();
    expect(ws.facts.map((f: { entity_id: string }) => f.entity_id)).toContain("SC12-PROP-MUG-01");
  });

  it("POST /v1/entities/:eid/state records a candidate transition + classification", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/entities/SC12-PROP-CAN-01/state",
      payload: { state: "removed", scene: "sc_12", shot: "shot_6" },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.event.canonical).toBe(false);
    expect(["ok", "skip", "regression"]).toContain(body.transition);
  });

  it("422s an expected_state the machine does not define", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/productions/p_dry/entities",
      payload: {
        type: "wardrobe",
        canonical_desc: "x",
        expected_state: "on_fire",
        scene: "sc_12",
      },
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("@scenelock/api — P2 media-processor + gate-clearance", () => {
  it("POST /v1/scenes/:sid/rerun-gates runs the gate and replaces clearance findings", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/scenes/sc_12/rerun-gates",
      headers: { "x-scenelock-role": "sre_admin" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.shots).toBe(6);
    expect(body.verdict.verdict).toBe("HELD");

    const findings = (
      await app.inject({ method: "GET", url: "/v1/productions/p_dry/findings?gate=clearance&stage=shot" })
    ).json().findings as Array<{ finding_id: string; risk_class: string; blocking: boolean }>;

    // gate-computed ids, seed placeholders gone
    expect(findings.every((f) => f.finding_id.startsWith("f_cl_"))).toBe(true);
    expect(findings.map((f) => f.risk_class).sort()).toEqual([
      "ai_disclosure",
      "lyrics",
      "real_person",
      "trademark",
    ]);
    // only the two deterministic-1.0 findings block
    expect(findings.filter((f) => f.blocking).map((f) => f.risk_class).sort()).toEqual([
      "ai_disclosure",
      "real_person",
    ]);
  });

  it("verdict stays HELD after rerun (real_person + ai_disclosure block; continuity seed still there)", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/scenes/sc_12/rerun-gates",
      headers: { "x-scenelock-role": "sre_admin" },
    });
    const v = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/verdict" })).json();
    expect(v.verdict).toBe("HELD");
    // f_can_teleport (continuity seed) + f_cl_shot_4_real_person + f_cl_shot_6_ai_disclosure
    expect(v.inputs.blocking_open).toBe(3);
  });

  it("GET /v1/shots/:shotId/media returns processed artifacts after a rerun", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/scenes/sc_12/rerun-gates",
      headers: { "x-scenelock-role": "sre_admin" },
    });
    const m = (await app.inject({ method: "GET", url: "/v1/shots/shot_4/media" })).json().media;
    expect(m.audio.sample_rate_hz).toBe(16000);
    expect(m.c2pa.generator).toBe("veo-job-shot_4");
    expect(m.transcript).toContain("storm");
  });
});

describe("@scenelock/api — P3 incidents + audit", () => {
  it("GET /v1/productions/:pid/incidents opens one per blocking finding, assigned to fixer", async () => {
    const { incidents } = (
      await app.inject({ method: "GET", url: "/v1/productions/p_dry/incidents" })
    ).json();
    expect(incidents).toHaveLength(3);
    expect(incidents.every((i: { assignee: string; status: string }) => i.assignee === "fixer" && i.status === "open")).toBe(true);
  });

  it("waiving a blocking finding auto-closes its incident with a note", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/findings/f_real_person/adjudication",
      headers: { "x-scenelock-role": "producer" },
      payload: { decision: "waive", reason: "cleared with brand legal — license 4417-EU on file" },
    });
    const { incidents } = (
      await app.inject({ method: "GET", url: "/v1/productions/p_dry/incidents" })
    ).json();
    const closed = incidents.find((i: { finding_id: string }) => i.finding_id === "f_real_person");
    expect(closed.status).toBe("closed");
    expect(closed.note).toMatch(/waived/);
    expect(incidents.filter((i: { status: string }) => i.status === "open")).toHaveLength(2);
  });

  it("GET /v1/productions/:pid/loop includes directives, attempts and incidents", async () => {
    const body = (await app.inject({ method: "GET", url: "/v1/productions/p_dry/loop" })).json();
    expect(body.directives.length).toBeGreaterThan(0);
    expect(body.attempts.length).toBeGreaterThan(0);
    expect(body.incidents.length).toBe(3);
  });

  it("GET /v1/admin/audit is gated to Producer/SRE", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/v1/admin/audit", headers: { "x-scenelock-role": "qa_reviewer" } })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "GET", url: "/v1/admin/audit", headers: { "x-scenelock-role": "sre_admin" } })).statusCode,
    ).toBe(200);
  });
});

describe("@scenelock/api — P4 remediation loop + budget governor", () => {
  it("POST /v1/scenes/:sid/auto-remediate drives HELD → LOCKED", async () => {
    // normalise clearance findings first
    await app.inject({ method: "POST", url: "/v1/scenes/sc_12/rerun-gates", headers: { "x-scenelock-role": "sre_admin" } });
    const before = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/verdict" })).json();
    expect(before.verdict).toBe("HELD");

    const r = await app.inject({
      method: "POST",
      url: "/v1/scenes/sc_12/auto-remediate",
      headers: { "x-scenelock-role": "producer" },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.verdict.verdict).toBe("LOCKED");
    expect(body.results.every((x: { outcome: string }) => x.outcome === "resolved")).toBe(true);

    const incidents = (await app.inject({ method: "GET", url: "/v1/productions/p_dry/incidents" })).json().incidents;
    expect(incidents.every((i: { status: string }) => i.status === "closed")).toBe(true);
  });

  it("auto-remediate signs a certificate on LOCK, and it verifies", async () => {
    await app.inject({ method: "POST", url: "/v1/scenes/sc_12/rerun-gates", headers: { "x-scenelock-role": "sre_admin" } });
    const rem = (
      await app.inject({ method: "POST", url: "/v1/scenes/sc_12/auto-remediate", headers: { "x-scenelock-role": "producer" } })
    ).json();
    expect(rem.verdict.verdict).toBe("LOCKED");
    expect(rem.certificate).not.toBeNull();

    const { certificate, chain } = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/certificate" })).json();
    expect(certificate.payload.disclaimer).toContain("Not a legal opinion");
    expect(chain.length).toBeGreaterThanOrEqual(1);

    const v = (await app.inject({ method: "GET", url: `/verify/${certificate.slug}` })).json();
    expect(v).toMatchObject({ status: "valid", chain_ok: true, signature_ok: true, scene: "sc_12" });
  });

  it("GET /verify/:slug for an unknown slug returns status unknown (no leak, no auth)", async () => {
    const v = (await app.inject({ method: "GET", url: "/verify/bogus-0000" })).json();
    expect(v.status).toBe("unknown");
  });

  it("POST /v1/bench/run publishes a SceneBench scorecard; GET /v1/bench serves it", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/bench" })).statusCode).toBe(404);
    const card = (await app.inject({ method: "POST", url: "/v1/bench/run", headers: { "x-scenelock-role": "sre_admin" } })).json();
    expect(card.release_ok).toBe(true);
    expect(card.fp_rate_at_tau).toBe(0);
    expect((await app.inject({ method: "GET", url: "/v1/bench" })).json().corpus_version).toBe(card.corpus_version);
  });

  it("POST /v1/demo/run reproduces Acts 1–3 in one call: HELD → LOCKED + certificate", async () => {
    const seen: string[] = [];
    // demo.act markers ride the same SSE bus
    app.ctx.events.onSse((e) => seen.push(e.type));

    const r = await app.inject({ method: "POST", url: "/v1/demo/run" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.acts.map((a: { title: string }) => a.title)).toEqual([
      "Gates sweep",
      "Radar held",
      "Self-heal",
    ]);
    expect(body.verdict.verdict).toBe("LOCKED");
    expect(body.certificate.slug).toMatch(/^sc12-/);
    expect(seen.filter((t) => t === "demo.act").length).toBeGreaterThanOrEqual(4);

    const v = (await app.inject({ method: "GET", url: `/verify/${body.certificate.slug}` })).json();
    expect(v.status).toBe("valid");
  });

  it("POST /v1/demo/reset returns to HELD with 3 blocking", async () => {
    await app.inject({ method: "POST", url: "/v1/demo/run" });
    const reset = (await app.inject({ method: "POST", url: "/v1/demo/reset" })).json();
    expect(reset.verdict.verdict).toBe("HELD");
    expect(reset.verdict.inputs.blocking_open).toBe(3);
  });

  it("GET /v1/productions/:pid/budget reports level green with the seeded caps", async () => {
    const b = (await app.inject({ method: "GET", url: "/v1/productions/p_dry/budget" })).json();
    expect(b.level).toBe("green");
    expect(b.detail.loop_attempts.cap).toBe(24);
  });

  it("rerun-gates now produces gate-computed continuity findings (P5)", async () => {
    await app.inject({ method: "POST", url: "/v1/scenes/sc_12/rerun-gates", headers: { "x-scenelock-role": "sre_admin" } });
    const cont = (
      await app.inject({ method: "GET", url: "/v1/productions/p_dry/findings?gate=continuity&stage=shot" })
    ).json().findings as Array<{ finding_id: string; risk_class: string; blocking: boolean }>;
    expect(cont.every((f) => f.finding_id.startsWith("f_ct_"))).toBe(true);
    expect(cont.map((f) => f.risk_class).sort()).toEqual([
      "continuity.identity",
      "continuity.presence",
      "continuity.state",
    ]);
    expect(cont.filter((f) => f.blocking).map((f) => f.risk_class)).toEqual(["continuity.state"]);
  });

  it("POST /v1/productions/:pid/reanchor repins every entity anchor (G-09)", async () => {
    const before = (await app.inject({ method: "GET", url: "/v1/entities/SC12-CHAR-RIYA-01" })).json();
    expect(before.entity.embedding_model_version).toBe("gemini-embed-001@2026-03");
    const r = await app.inject({
      method: "POST",
      url: "/v1/productions/p_dry/reanchor",
      headers: { "x-scenelock-role": "sre_admin" },
      payload: { embedding_model_version: "gemini-embed-002@2026-11" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().repinned.length).toBe(4);
    const after = (await app.inject({ method: "GET", url: "/v1/entities/SC12-CHAR-RIYA-01" })).json();
    expect(after.entity.embedding_model_version).toBe("gemini-embed-002@2026-11");
  });

  it("GET /v1/productions/:pid/consent-records returns the registry (S8)", async () => {
    const { records } = (await app.inject({ method: "GET", url: "/v1/productions/p_dry/consent-records" })).json();
    expect(records.length).toBe(1);
    expect(records[0].subject).toContain("Hargrove");
    expect(records[0].status).toBe("expired");
  });

  it("kill switch needs the typed phrase and Producer/SRE, then HELDs the scene", async () => {
    expect(
      (await app.inject({ method: "POST", url: "/v1/productions/p_dry/kill-switch", headers: { "x-scenelock-role": "qa_reviewer" }, payload: { engaged: true, phrase: "PAUSE LOOP" } })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: "/v1/productions/p_dry/kill-switch", headers: { "x-scenelock-role": "producer" }, payload: { engaged: true } })).statusCode,
    ).toBe(422);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/productions/p_dry/kill-switch",
      headers: { "x-scenelock-role": "producer" },
      payload: { engaged: true, phrase: "PAUSE LOOP" },
    });
    expect(ok.statusCode).toBe(200);
    const v = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/verdict" })).json();
    expect(v.reason).toBe("kill_switch_engaged");
  });
});

describe("@scenelock/api — R1 E&O / Underwriting Pack", () => {
  it("GET /v1/scenes/:sid/underwriting-pack assembles the binder; the seed is not yet bindable", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/scenes/sc_12/underwriting-pack" });
    expect(res.statusCode).toBe(200);
    const { pack } = res.json();

    expect(pack.scene_id).toBe("sc_12");
    expect(pack.production_summary.title).toBeTruthy();
    // seed has an unlabelled deceased-replica + missing consent + no certificate yet
    expect(pack.bindable).toBe(false);
    expect(pack.blocking_gaps.length).toBeGreaterThan(0);
    expect(pack.certificate.present).toBe(false);

    const ids = pack.checklist.map((c: { id: string }) => c.id);
    expect(ids).toContain("digital_replica_consent");
    expect(ids).toContain("signed_certificate");
    // every checklist row is one of the three states
    for (const c of pack.checklist) expect(["pass", "fail", "na"]).toContain(c.status);
  });

  it("GET /v1/scenes/:sid/underwriting-pack.md serves the human binder as markdown", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/scenes/sc_12/underwriting-pack.md" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.body).toContain("# E&O / Underwriting Pack");
    expect(res.body).toContain("## 1. Underwriter checklist");
  });

  it("after auto-remediate reaches LOCKED, the pack carries the signed certificate", async () => {
    await app.inject({ method: "POST", url: "/v1/scenes/sc_12/auto-remediate" });
    const { pack } = (await app.inject({ method: "GET", url: "/v1/scenes/sc_12/underwriting-pack" })).json();
    expect(pack.certificate.present).toBe(true);
    expect(pack.certificate.verify_path).toContain("/verify/");
    expect(pack.checklist.find((c: { id: string }) => c.id === "signed_certificate").status).toBe("pass");
  });

  it("404s for an unknown scene", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/scenes/nope/underwriting-pack" })).statusCode).toBe(404);
  });
});
