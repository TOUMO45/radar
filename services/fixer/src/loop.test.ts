import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { Archivist } from "@scenelock/archivist";
import { DryRunMediaBackend, MediaProcessor } from "@scenelock/media-processor";
import { GateClearance } from "@scenelock/gate-clearance";
import { GateContinuity } from "@scenelock/gate-continuity";
import { IncidentWatchdog } from "@scenelock/incidents";
import { computeVerdict } from "@scenelock/verdict";
import { evaluateBudget } from "./budget.js";
import { MockVeoBackend, RemediationLoop, type RemediationLoopDeps } from "./loop.js";

const clock = new FixedClock("2026-08-29T16:30:00.000Z");
let storage: InMemoryStorage;
let events: InMemoryEventBus;
let deps: RemediationLoopDeps;

async function verdictNow() {
  const shots = await storage.listShots("sc_12");
  const findings = await storage.listFindings("p_dry", { scene: "sc_12" });
  const p = (await storage.getProduction("p_dry"))!;
  return computeVerdict({
    scene_id: "sc_12",
    tau: p.settings.tau,
    config_version: p.settings.config_version,
    kill_switch: p.kill_switch,
    shots,
    findings,
    now: () => clock.now(),
  });
}

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  const ids = new SeqIdGen();
  const archivist = new Archivist({ storage, clock, ids, events });
  deps = {
    storage,
    clock,
    ids,
    events,
    archivist,
    mediaProcessor: new MediaProcessor({ storage, clock, events, backend: new DryRunMediaBackend(() => clock.now()) }),
    gateClearance: new GateClearance({ storage, clock, events }),
    gateContinuity: new GateContinuity({ storage, clock, archivist, events }),
    incidents: new IncidentWatchdog({ storage, clock, ids, events }),
  };
  // normalise: process media + run BOTH gates across the scene once
  for (const s of await storage.listShots("sc_12")) {
    await deps.mediaProcessor.process(s.shot_id);
    const fresh = [
      ...(await deps.gateClearance.runShot(s.shot_id)).findings,
      ...(await deps.gateContinuity.runShot(s.shot_id)).findings,
    ];
    for (const f of await storage.listFindings("p_dry", { scene: "sc_12", shot: s.shot_id })) {
      if ((f.gate === "clearance" || f.gate === "continuity") && f.stage === "shot")
        await storage.deleteFinding(f.finding_id);
    }
    for (const f of fresh) await storage.putFinding(f);
  }
  // API opens incidents for blocking findings at boot — do the same here
  await deps.incidents.sweep("p_dry", 0.7);
});

describe("RemediationLoop — Flow B (spec §6, E.3)", () => {
  it("starts HELD with 3 blocking findings", async () => {
    const v = await verdictNow();
    expect(v.verdict).toBe("HELD");
    expect(v.inputs.blocking_open).toBe(3);
  });

  it("auto-remediates the scene HELD → LOCKED within 2 attempts per finding", async () => {
    const loop = new RemediationLoop(deps);
    const { results, verdict } = await loop.remediateScene("sc_12");

    expect(verdict!.verdict).toBe("LOCKED");
    expect(results.map((r) => r.outcome).sort()).toEqual(["resolved", "resolved", "resolved"]);
    expect(results.every((r) => r.attempts >= 1 && r.attempts <= 2)).toBe(true);

    // every incident auto-closed
    const incidents = await storage.listIncidents("p_dry");
    expect(incidents.length).toBe(3);
    expect(incidents.every((i) => i.status === "closed")).toBe(true);

    // budget consumed, still green
    const p = (await storage.getProduction("p_dry"))!;
    expect(p.spend.loop_attempts).toBeGreaterThanOrEqual(3);
    expect(evaluateBudget(p.spend, p.settings.cost_caps).level).toBe("green");
    expect(p.kill_switch).toBe(false);
  });

  it("shot_6 gains a valid C2PA manifest → c2pa coverage 6/6", async () => {
    await new RemediationLoop(deps).remediateScene("sc_12");
    const v = await verdictNow();
    expect(v.inputs.c2pa_coverage.label).toBe("6/6");
    expect(v.inputs.gate_coverage.completed).toBe(v.inputs.gate_coverage.required);
  });

  it("emits loop.attempt and verdict.changed on the SSE channel", async () => {
    const seen: string[] = [];
    events.onSse((e) => seen.push(e.type));
    await new RemediationLoop(deps).remediateScene("sc_12");
    expect(seen).toContain("loop.attempt");
    expect(seen).toContain("verdict.changed");
    expect(seen).toContain("incident.closed");
  });

  it("infra failures do not consume a loop attempt (G-06)", async () => {
    const loop = new RemediationLoop({
      ...deps,
      veo: new MockVeoBackend({ storage, archivist: deps.archivist, clock }, { failInfraOn: [1] }),
    });
    const r = await loop.remediateFinding(
      (await firstBlocking()).finding_id,
    );
    expect(r.outcome).toBe("resolved");
    // attempt 1 failed infra, attempt "2" is really the first budget-consuming try
    expect(r.attempts).toBe(1);
  });

  it("an invariant-breaking regen raises a new blocking finding and the loop escalates (R2)", async () => {
    const loop = new RemediationLoop({
      ...deps,
      veo: new MockVeoBackend({ storage, archivist: deps.archivist, clock }, { breakInvariant: true }),
    });
    const target = await firstBlocking();
    const r = await loop.remediateFinding(target.finding_id);
    expect(r.outcome).toBe("escalated");
    expect(r.attempts).toBe(2);
    const invFindings = (await storage.listFindings("p_dry", { scene: "sc_12" })).filter(
      (f) => f.rule === "invariant_violation",
    );
    expect(invFindings.length).toBeGreaterThan(0);
  });

  it("100% budget → auto kill-switch, loop pauses, verdict stays HELD, findings intact", async () => {
    const p = (await storage.getProduction("p_dry"))!;
    await storage.putProduction({
      ...p,
      settings: { ...p.settings, cost_caps: { ...p.settings.cost_caps, loop_attempts_cap: 0 } },
    });
    const loop = new RemediationLoop(deps);
    const { results, verdict } = await loop.remediateScene("sc_12");
    expect(results[0]!.outcome).toBe("paused_budget");
    expect((await storage.getProduction("p_dry"))!.kill_switch).toBe(true);
    expect(verdict!.verdict).toBe("HELD");
    expect((await storage.listFindings("p_dry", { scene: "sc_12" })).length).toBeGreaterThan(0);
  });
});

async function firstBlocking() {
  const p = (await storage.getProduction("p_dry"))!;
  const fs = await storage.listFindings("p_dry", { scene: "sc_12" });
  return fs.find((f) => f.severity === "high" && f.confidence >= p.settings.tau && f.stage === "shot" && f.status === "open")!;
}
