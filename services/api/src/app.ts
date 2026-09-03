import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { AdjudicationDecision } from "@scenelock/schema";
import { registerVerifyRoute } from "@scenelock/verifier";
import { buildContext, type AppContext } from "./context.js";
import { Services } from "./services.js";
import { resolveIdentity } from "./auth.js";
import { registerQuickScanRoute } from "./quickscan-route.js";
import { rateLimit } from "./rate-limit.js";
import { annotate } from "./grafana.js";
import { PARTNERS } from "./partners.js";
import { computeDeadlines } from "./deadlines.js";
import { askAssistant } from "./assistant.js";
import { renderBadgeSvg, sanitizeSlug } from "./badge.js";

/**
 * REST surface — spec F.1. P0 read paths + the adjudication write path;
 * P1 adds World State (archivist) read + propose routes.
 * RBAC (B.1): elevated roles are proven via a bearer token (services/api/src/
 * auth.ts, DEV/DEMO secrets), never trusted from a raw client header — fixed
 * 2026-09-03 (VULN-1 audit finding: header-stubbed RBAC was bypassable by any
 * caller setting x-scenelock-role directly).
 */
export function buildApp(ctx: AppContext = buildContext()): FastifyInstance {
  const app = Fastify({ logger: false });
  const svc = new Services(ctx);

  app.register(cors, { origin: true });
  app.decorate("ctx", ctx);

  // Quick Scan (additive, standalone — no production_id, no auth beyond its
  // own rate limit). Registered as its own plugin so its multipart parser +
  // rate limiter stay isolated from every other route.
  app.register(registerQuickScanRoute);

  // open incidents for any already-blocking seeded findings at boot (C.3 Flow B)
  app.addHook("onReady", async () => {
    for (const r of await svc.listProductions("org_demo")) {
      await svc.sweepIncidents(r.production.production_id);
    }
  });

  app.get("/health", async () => {
    const p = await ctx.storage.getProduction("p_dry");
    return { status: "ok", mode: p?.mode ?? "unknown", service: "@scenelock/api" };
  });

  // --- productions -------------------------------------------------------
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/productions", async (req) => ({
    productions: await svc.listProductions(req.params.orgId),
  }));

  // Portfolio / slate roll-up (roadmap R8) — Trust + deliverability at a glance.
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/portfolio", async (req) => ({
    portfolio: await svc.portfolio(req.params.orgId),
  }));

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid", async (req, reply) => {
    const p = await svc.getProduction(req.params.pid);
    if (!p) return reply.code(404).send({ error: "production not found" });
    const scenes = await svc.listScenes(req.params.pid);
    return { production: p, verdict: scenes[0]?.verdict ?? null };
  });

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/scenes", async (req) => ({
    scenes: await svc.listScenes(req.params.pid),
  }));

  // --- scenes / shots --------------------------------------------------
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid", async (req, reply) => {
    const s = await svc.getScene(req.params.sid);
    if (!s) return reply.code(404).send({ error: "scene not found" });
    return { scene: s };
  });

  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/shots", async (req) => ({
    shots: await svc.listShots(req.params.sid),
  }));

  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/verdict", async (req, reply) => {
    const v = await svc.sceneVerdict(req.params.sid);
    if (!v) return reply.code(404).send({ error: "scene not found" });
    return v;
  });

  app.get<{ Params: { shotId: string } }>("/v1/shots/:shotId/media", async (req, reply) => {
    const m = await svc.getMediaArtifacts(req.params.shotId);
    if (!m) return reply.code(404).send({ error: "shot not processed" });
    return { media: m };
  });

  // supervisor slice (P2): media-processor + gate-clearance across the scene
  app.post<{ Params: { sid: string } }>("/v1/scenes/:sid/rerun-gates", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "sre_admin", "qa_reviewer"].includes(role))
      return reply.code(403).send({ error: "rerun-gates requires Producer, SRE or QA Reviewer" });
    try {
      return await svc.rerunGates(req.params.sid);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  // --- remediation loop (P4) -----------------------------------------
  app.post<{ Params: { sid: string } }>("/v1/scenes/:sid/auto-remediate", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "sre_admin", "qa_reviewer"].includes(role))
      return reply.code(403).send({ error: "auto-remediate requires Producer, SRE or QA Reviewer" });
    try {
      return await svc.autoRemediateScene(req.params.sid);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { fid: string }; Body: { manual?: boolean } }>(
    "/v1/findings/:fid/remediate",
    async (req) => svc.remediateFinding(req.params.fid, { manual: req.body?.manual ?? false }),
  );

  // manual regeneration (Flow D) — consumes budget, flagged manual
  app.post<{ Params: { fid: string } }>("/v1/findings/:fid/regenerate", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "sre_admin", "qa_reviewer"].includes(role))
      return reply.code(403).send({ error: "manual regenerate requires Reviewer+ (B.1)" });
    return svc.remediateFinding(req.params.fid, { manual: true });
  });

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/budget", async (req, reply) => {
    const b = await svc.budget(req.params.pid);
    if (!b) return reply.code(404).send({ error: "production not found" });
    return b;
  });

  app.post<{ Params: { pid: string }; Body: { engaged?: boolean; phrase?: string } }>(
    "/v1/productions/:pid/kill-switch",
    async (req, reply) => {
      const { role } = resolveIdentity(req.headers);
      if (!["producer", "sre_admin"].includes(role))
        return reply.code(403).send({ error: "kill switch is Producer or SRE only (B.1, E.12)" });
      const engaged = req.body?.engaged ?? true;
      if (engaged && req.body?.phrase !== "PAUSE LOOP")
        return reply.code(422).send({ error: 'type the phrase "PAUSE LOOP" to engage (C-20)' });
      const r = await svc.setKillSwitch(req.params.pid, engaged);
      if (!r) return reply.code(404).send({ error: "production not found" });
      return r;
    },
  );

  // --- findings ------------------------------------------------------
  app.get<{
    Params: { pid: string };
    Querystring: Record<string, string | undefined>;
  }>("/v1/productions/:pid/findings", async (req) => {
    const q = req.query;
    const findings = await svc.listFindings(req.params.pid, {
      scene: q.scene,
      gate: q.gate,
      risk_class: q.risk_class,
      status: q.status,
      source: q.source,
      stage: q.stage,
      shot: q.shot,
      blocking: q.blocking === undefined ? undefined : q.blocking === "true",
    });
    const facets = { gate: {} as Record<string, number>, status: {} as Record<string, number> };
    for (const f of findings) {
      facets.gate[f.gate] = (facets.gate[f.gate] ?? 0) + 1;
      facets.status[f.status] = (facets.status[f.status] ?? 0) + 1;
    }
    return { findings, facets, next_cursor: null };
  });

  app.get<{ Params: { fid: string } }>("/v1/findings/:fid", async (req, reply) => {
    const r = await svc.getFinding(req.params.fid);
    if (!r) return reply.code(404).send({ error: "finding not found" });
    return r;
  });

  app.post<{
    Params: { fid: string };
    Body: { decision?: string; reason?: string; idempotency_key?: string };
  }>("/v1/findings/:fid/adjudication", async (req, reply) => {
    const parsed = AdjudicationDecision.safeParse(req.body?.decision);
    if (!parsed.success)
      return reply.code(422).send({ error: "decision must be confirm|waive|override" });

    const { role, by } = resolveIdentity(req.headers);

    const result = await svc.adjudicate(req.params.fid, {
      decision: parsed.data,
      reason: req.body?.reason ?? "",
      by,
      role,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });

    return reply.code(201).send({
      adjudication_id: result.adjudication.adjudication_id,
      finding_status: result.finding.status,
      verdict: result.verdict,
    });
  });

  // --- world state (archivist, E.1) ---------------------------------
  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/entities", async (req) => ({
    entities: await svc.listEntities(req.params.pid),
  }));

  app.get<{ Params: { eid: string } }>("/v1/entities/:eid", async (req, reply) => {
    const e = await svc.getEntity(req.params.eid);
    if (!e) return reply.code(404).send({ error: "entity not found" });
    const timeline = await ctx.archivist.timeline(req.params.eid);
    return { entity: e, state_events: timeline };
  });

  app.get<{
    Params: { pid: string };
    Querystring: { scene?: string; state?: string; text?: string; status?: string };
  }>("/v1/productions/:pid/world-state", async (req) => ({
    facts: await ctx.archivist.queryWorldState(req.params.pid, {
      scene: req.query.scene,
      state: req.query.state,
      text: req.query.text,
      status: req.query.status as never,
    }),
  }));

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/consent-records", async (req) => ({
    records: await svc.listConsentRecords(req.params.pid),
  }));

  // --- synthetic-media compliance & trust (Radar 2026 extension) ------
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/compliance", async (req, reply) => {
    const r = await svc.sceneCompliance(req.params.sid);
    if (!r) return reply.code(404).send({ error: "scene not found" });
    return r;
  });

  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/trust-score", async (req, reply) => {
    const r = await svc.sceneTrustScore(req.params.sid);
    if (!r) return reply.code(404).send({ error: "scene not found" });
    return r;
  });

  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/delivery-readiness", async (req, reply) => {
    const r = await svc.sceneDeliveryReadiness(req.params.sid);
    if (!r) return reply.code(404).send({ error: "scene not found" });
    return r;
  });

  // Provenance verification (roadmap R2) — declared C2PA/watermark → VERIFIED.
  app.post<{ Params: { id: string }; Body: { asset_ref?: string | null } }>(
    "/v1/shots/:id/verify-provenance",
    async (req, reply) => {
      const r = await svc.verifyShotProvenance(req.params.id, req.body?.asset_ref ?? null);
      if (!r) return reply.code(404).send({ error: "no declared provenance for this shot" });
      return r;
    },
  );

  // Compliance diff over the loop (roadmap R7) — before/after the self-heal.
  app.post<{ Params: { sid: string } }>("/v1/scenes/:sid/compliance-diff", async (req, reply) => {
    const scene = await svc.getScene(req.params.sid);
    if (!scene) return reply.code(404).send({ error: "scene not found" });
    return svc.complianceDiff(req.params.sid);
  });

  // Likeness-rights marketplace (roadmap R5) — quote + clear a replica likeness.
  app.get<{ Params: { id: string } }>("/v1/shots/:id/likeness-options", async (req, reply) => {
    const r = await svc.likenessOptions(req.params.id);
    if (!r) return reply.code(404).send({ error: "no provenance for shot" });
    return r;
  });
  app.post<{ Params: { id: string }; Body: { provider?: string } }>(
    "/v1/shots/:id/clear-likeness",
    async (req, reply) => {
      const { role, by: actor } = resolveIdentity(req.headers);
      if (!["producer", "legal", "sre_admin"].includes(role))
        return reply.code(403).send({ error: "clearing a likeness requires Producer or Legal (D12)" });
      if (!req.body?.provider) return reply.code(422).send({ error: "provider is required" });
      const r = await svc.clearLikeness(req.params.id, req.body.provider, actor);
      if (!r.ok) return reply.code(r.code).send({ error: r.error });
      return r;
    },
  );

  // Technical delivery QC (roadmap R4) — master vs IMF/broadcast/DCP spec.
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/technical-delivery", async (req, reply) => {
    const r = await svc.sceneTechnicalDelivery(req.params.sid);
    if (!r) return reply.code(404).send({ error: "scene not found" });
    return r;
  });

  // Music cue sheet + rights (roadmap R6) — PRO cue sheet; rides the certificate.
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/cue-sheet", async (req, reply) => {
    const r = await svc.sceneCueSheet(req.params.sid);
    if (!r) return reply.code(404).send({ error: "scene not found" });
    return r;
  });

  // E&O / Underwriting Pack (roadmap R1) — the binder a distributor's insurer reads.
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/underwriting-pack", async (req, reply) => {
    const pack = await svc.underwritingPack(req.params.sid);
    if (!pack) return reply.code(404).send({ error: "scene not found" });
    return { pack };
  });

  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/underwriting-pack.md", async (req, reply) => {
    const md = await svc.underwritingPackMarkdown(req.params.sid);
    if (md === null) return reply.code(404).send({ error: "scene not found" });
    return reply
      .header("content-type", "text/markdown; charset=utf-8")
      .header("content-disposition", `inline; filename="underwriting-${req.params.sid}.md"`)
      .send(md);
  });

  // ===================================================================
  // "Wow features" — additive, grounded in real competitive gaps. Every
  // route below is new surface only; none changes an existing handler.
  // ===================================================================

  // FEATURE 1 — Live E&O / Underwriting Pack, production-scoped. Same
  // deterministic assembler as the scene routes above; `generated_at` is
  // request-time (SystemClock in prod), so two calls seconds apart differ —
  // it is genuinely regenerated, never a cached file. Accepts a production id
  // or a bare scene id.
  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/underwriting-pack", async (req, reply) => {
    const bundle = await svc.underwritingPackBundle(req.params.pid);
    if (!bundle) return reply.code(404).send({ error: "no production or scene for that id" });
    await annotate(`E&O pack generated for ${bundle.scene_id}`, ["underwriting", bundle.scene_id]);
    return bundle;
  });

  // FEATURE 2 — Public embeddable badge. No auth (same trust model as
  // /verify/:slug; exposes strictly less — a colour + short label only).
  app.get<{ Params: { slug: string } }>("/v1/badge/:slug", async (req, reply) => {
    const slug = sanitizeSlug(req.params.slug);
    const result = await ctx.certifier.verify(slug);
    const svg = renderBadgeSvg(result.status);
    await annotate(
      `Badge served: ${slug} (${result.status === "valid" ? "Cleared" : "Not Certified"})`,
      ["badge"],
    );
    return reply
      .header("content-type", "image/svg+xml; charset=utf-8")
      .header("cache-control", "public, max-age=30")
      .send(svg);
  });

  // FEATURE 4 — Partner map: the adjacent players RADAR orchestrates, with an
  // honest per-partner status ("live" only where a self-test genuinely passes).
  app.get("/v1/partners", async () => ({
    generated_at: ctx.clock.now(),
    partners: PARTNERS,
  }));

  // FEATURE 5 — Live regulatory deadline clock over the cited effective dates
  // already in @scenelock/rulepack; `days_remaining` computed from real now.
  app.get("/v1/compliance/deadlines", async () => computeDeadlines(ctx.clock.now()));

  // FEATURE 6 — Findings-grounded assistant. Read-only, zero tools, rate-limited
  // exactly like /v1/quickscan (same shared preHandler). Grounding is fetched
  // server-side FIRST; finding text is DATA, never instructions (spec G-13).
  app.post<{ Body: { production_id?: unknown; question?: unknown } }>(
    "/v1/assistant/ask",
    { preHandler: rateLimit },
    async (req, reply) => {
      const pid = req.body?.production_id;
      const question = req.body?.question;
      if (typeof pid !== "string" || !pid.trim())
        return reply.code(422).send({ error: "production_id is required" });
      if (typeof question !== "string" || !question.trim())
        return reply.code(422).send({ error: "question is required" });
      if (question.length > 2000)
        return reply.code(413).send({ error: "question exceeds the 2000 character limit" });

      const grounding = await svc.assistantGrounding(pid);
      if (!grounding) {
        return {
          grounded: false,
          model: null,
          answer:
            `No RADAR data was found for "${pid}". I can only answer from a registered ` +
            `production's findings, and none resolved for that id.`,
        };
      }

      await annotate(`Assistant asked: ${question.slice(0, 80)}`, ["assistant", grounding.scene_id]);

      // askAssistant never throws — it degrades to grounded facts with model:null.
      // The catch is a last-resort net so this route cannot 5xx on the demo.
      try {
        const out = await askAssistant({ grounding, question });
        return { ...out, grounding };
      } catch (err) {
        return {
          grounded: true,
          model: null,
          grounding_check: true,
          note: `assistant fell back to grounded facts: ${(err as Error).message}`,
          answer:
            `RADAR state for ${grounding.scene_id}: verdict ${grounding.verdict} ` +
            `(${grounding.verdict_reason}), Trust ${grounding.trust_score ?? "n/a"}, ` +
            `${grounding.open_blocking_count} open blocking finding(s): ` +
            `${grounding.open_blocking_finding_ids.join(", ") || "none"}.`,
          grounding,
        };
      }
    },
  );

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/compliance-profile", async (req, reply) => {
    const p = await svc.getComplianceProfile(req.params.pid);
    if (!p) return reply.code(404).send({ error: "production not found" });
    return { profile: p };
  });

  app.put<{
    Params: { pid: string };
    Body: { territories?: string[]; platforms?: string[] };
  }>("/v1/productions/:pid/compliance-profile", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "legal", "sre_admin"].includes(role))
      return reply.code(403).send({ error: "editing the compliance profile requires Producer, Legal or SRE (B.1)" });
    const p = await svc.setComplianceProfile(req.params.pid, {
      territories: req.body?.territories as never,
      platforms: req.body?.platforms as never,
    });
    if (!p) return reply.code(404).send({ error: "production not found" });
    return { profile: p };
  });

  app.post<{ Params: { pid: string }; Body: { embedding_model_version?: string } }>(
    "/v1/productions/:pid/reanchor",
    async (req, reply) => {
      const { role } = resolveIdentity(req.headers);
      if (!["producer", "sre_admin"].includes(role))
        return reply.code(403).send({ error: "re-anchor is Producer or SRE only (G-09)" });
      const v = req.body?.embedding_model_version ?? `gemini-embed-001@${new Date().getFullYear()}-re`;
      return svc.reanchor(req.params.pid, v);
    },
  );

  app.post<{
    Params: { eid: string };
    Body: { state?: string; scene?: string; shot?: string | null; evidence_uri?: string | null };
  }>("/v1/entities/:eid/state", async (req, reply) => {
    if (!req.body?.state || !req.body?.scene)
      return reply.code(422).send({ error: "state and scene are required" });
    const by = (req.headers["x-scenelock-user"] as string) ?? "planner";
    try {
      const res = await svc.proposeState(req.params.eid, {
        state: req.body.state,
        scene: req.body.scene,
        shot: req.body.shot ?? null,
        evidence_uri: req.body.evidence_uri ?? null,
        by,
      });
      return reply.code(201).send({
        entity: res.entity,
        transition: res.verdict,
        event: res.event,
      });
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  app.post<{
    Params: { pid: string };
    Body: {
      entity_id?: string;
      type?: string;
      canonical_desc?: string;
      expected_state?: string;
      scene?: string;
      shot?: string | null;
    };
  }>("/v1/productions/:pid/entities", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.type || !b.canonical_desc || !b.expected_state || !b.scene)
      return reply
        .code(422)
        .send({ error: "type, canonical_desc, expected_state, scene are required" });
    try {
      const entity = await ctx.archivist.registerPlannedEntity({
        production_id: req.params.pid,
        entity_id: b.entity_id,
        type: b.type as never,
        canonical_desc: b.canonical_desc,
        expected_state: b.expected_state,
        scene: b.scene,
        shot: b.shot ?? null,
      });
      return reply.code(201).send({ entity });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  // --- loop monitor (S7) -----------------------------------------
  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/loop", async (req) => {
    const { directives, attempts } = await svc.loop(req.params.pid);
    await svc.sweepIncidents(req.params.pid); // keep incidents in sync on read
    return { directives, attempts, incidents: await svc.listIncidents(req.params.pid) };
  });

  app.get<{ Params: { pid: string } }>("/v1/productions/:pid/incidents", async (req) => {
    await svc.sweepIncidents(req.params.pid);
    return { incidents: await svc.listIncidents(req.params.pid) };
  });

  // --- certificates (§8) + public verify (G-16) ----------------
  app.get<{ Params: { sid: string } }>("/v1/scenes/:sid/certificate", async (req, reply) => {
    const c = await svc.getSceneCertificate(req.params.sid);
    if (!c) return reply.code(404).send({ error: "no certificate for this scene" });
    const chain = await svc.listCertificates(c.production_id);
    return { certificate: c, chain: chain.map((x) => ({ id: x.certificate_id, hash: x.payload.certificate_hash, prev: x.payload.prior_certificate_hash, scene: x.scene_id })) };
  });

  app.get<{ Params: { cid: string } }>("/v1/certificates/:cid", async (req, reply) => {
    const c = await svc.getCertificate(req.params.cid);
    if (!c) return reply.code(404).send({ error: "certificate not found" });
    return { certificate: c };
  });

  app.post<{ Params: { sid: string } }>("/v1/scenes/:sid/certify", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "legal", "sre_admin"].includes(role))
      return reply.code(403).send({ error: "certify requires Producer, Legal or SRE" });
    try {
      return { certificate: await svc.certifyScene(req.params.sid) };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  registerVerifyRoute(app, ctx.certifier); // GET /verify/:slug — unauthenticated

  // --- demo spine (H.2) — reproducible in one take ------------
  app.post("/v1/demo/reset", async () => svc.demoReset());
  app.post<{ Params?: { sid?: string }; Body?: { scene?: string } }>(
    "/v1/demo/run",
    async (req) => svc.demoRun(req.body?.scene ?? "sc_12"),
  );

  // --- SceneBench (§10) ---------------------------------------
  app.get("/v1/bench", async (_req, reply) => {
    const card = await svc.getScorecard();
    if (!card) return reply.code(404).send({ error: "no scorecard yet — POST /v1/bench/run" });
    return card;
  });
  app.post("/v1/bench/run", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "sre_admin"].includes(role))
      return reply.code(403).send({ error: "running SceneBench requires Producer or SRE" });
    return svc.runSceneBench();
  });

  // --- audit (E.10) ---------------------------------------------
  app.get<{ Querystring: { org?: string; limit?: string } }>("/v1/admin/audit", async (req, reply) => {
    const { role } = resolveIdentity(req.headers);
    if (!["producer", "sre_admin"].includes(role))
      return reply.code(403).send({ error: "audit query requires Producer or SRE (B.1)" });
    const org = req.query.org ?? "org_demo";
    return { entries: await svc.listAudit(org, req.query.limit ? Number(req.query.limit) : 100) };
  });

  // --- SSE (D.4) — live bridge from the in-memory event bus ------
  app.get<{ Params: { pid: string } }>("/v1/stream/productions/:pid", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    let id = 0;
    const write = (type: string, data: unknown) => {
      reply.raw.write(`id: ${++id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const v = await svc.sceneVerdict("sc_12");
    if (v) write("verdict.changed", v);
    const off = ctx.events.onSse((e) => write(e.type, e.data));
    const hb = setInterval(() => write("heartbeat", { t: ctx.clock.nowMs() }), 15_000);
    req.raw.on("close", () => {
      off();
      clearInterval(hb);
    });
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
