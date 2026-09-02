import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { Archivist } from "@scenelock/archivist";
import { Finding, computeBlocking } from "@scenelock/schema";
import { GateContinuity } from "./index.js";

const clock = new FixedClock("2026-08-29T17:00:00.000Z");
let storage: InMemoryStorage;
let gate: GateContinuity;

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  const events = new InMemoryEventBus(() => clock.now());
  const archivist = new Archivist({ storage, clock, ids: new SeqIdGen(), events });
  gate = new GateContinuity({ storage, clock, archivist, events });
});

describe("gate-continuity (E.5.1)", () => {
  it("shot_3: cola can moved → continuity.state, deterministic, confidence 1.0, blocking", async () => {
    const { findings } = await gate.runShot("shot_3");
    const f = findings.find((x) => x.risk_class === "continuity.state")!;
    expect(f.source).toBe("deterministic");
    expect(f.confidence).toBe(1);
    expect(f.entity_id).toBe("SC12-PROP-CAN-01");
    expect(f.state_observed).toBe("on_screen(left_of_laptop)");
    expect(computeBlocking(f, 0.7)).toBe(true);
    expect(Finding.safeParse(f).success).toBe(true);
  });

  it("shot_3: blazer absent → continuity.presence, medium, non-blocking", async () => {
    const { findings } = await gate.runShot("shot_3");
    const f = findings.find((x) => x.risk_class === "continuity.presence")!;
    expect(f.severity).toBe("medium");
    expect(f.state_observed).toBe("absent");
    expect(computeBlocking(f, 0.7)).toBe(false);
  });

  it("shot_5: identity cosine 0.79 < T_id 0.82 → continuity.identity, hybrid, non-blocking", async () => {
    const { findings } = await gate.runShot("shot_5");
    const f = findings.find((x) => x.risk_class === "continuity.identity")!;
    expect(f.source).toBe("hybrid");
    expect(f.measurement).toMatchObject({ metric: "cosine", value: 0.79, threshold: 0.82 });
    expect(computeBlocking(f, 0.7)).toBe(false);
  });

  it("clean shots raise nothing", async () => {
    for (const id of ["shot_1", "shot_2", "shot_4", "shot_6"]) {
      const { findings } = await gate.runShot(id);
      expect(findings, id).toEqual([]);
    }
  });

  it("records observed states as archivist candidates and writes a continuity gate_run", async () => {
    await gate.runShot("shot_3");
    const events = await storage.listStateEvents("SC12-PROP-CAN-01");
    expect(events.some((e) => e.actor === "gate-continuity" && e.to === "on_screen(left_of_laptop)" && !e.canonical)).toBe(true);
    const shot = await storage.getShot("shot_3");
    expect(shot!.gate_runs.some((r) => r.gate === "continuity" && r.status === "completed")).toBe(true);
  });

  it("full scene sweep reproduces the seed's continuity beats", async () => {
    const all: Finding[] = [];
    for (const s of await storage.listShots("sc_12")) all.push(...(await gate.runShot(s.shot_id)).findings);
    const byClass = all.map((f) => `${f.shot_id}:${f.risk_class}`).sort();
    expect(byClass).toEqual([
      "shot_3:continuity.presence",
      "shot_3:continuity.state",
      "shot_5:continuity.identity",
    ]);
    expect(all.filter((f) => computeBlocking(f, 0.7)).map((f) => f.risk_class)).toEqual(["continuity.state"]);
  });

  it("re-run after the plan is patched to match expectation clears the finding", async () => {
    const plan = (await storage.getContinuity("shot_3"))!;
    await storage.putContinuity("shot_3", {
      ...plan,
      observed: plan.observed.map((o) =>
        o.entity_id === "SC12-PROP-CAN-01"
          ? { ...o, observed_state: "on_screen(right_of_laptop)" }
          : o.entity_id === "SC12-WARD-JACKET-01"
            ? { ...o, present: true, observed_state: "worn(on_chair_back)" }
            : o,
      ),
    });
    const { findings } = await gate.runShot("shot_3");
    expect(findings).toEqual([]);
  });
});
