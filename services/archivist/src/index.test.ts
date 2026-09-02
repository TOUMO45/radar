import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { PRODUCTION_ID, SCENE_ID } from "@scenelock/fixtures";
import { Archivist, classifyTransition } from "./index.js";

let arc: Archivist;
let storage: InMemoryStorage;
let events: InMemoryEventBus;
const clock = new FixedClock("2026-08-29T15:00:00.000Z");

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  arc = new Archivist({ storage, clock, ids: new SeqIdGen(), events });
});

describe("classifyTransition — entity state machines (B.2)", () => {
  it("prop: introduced → on_screen is ok, backward is regression", () => {
    expect(classifyTransition("prop", null, "introduced")).toBe("ok");
    expect(classifyTransition("prop", "introduced", "on_screen")).toBe("ok");
    expect(classifyTransition("prop", "on_screen", "introduced")).toBe("regression");
    expect(classifyTransition("prop", "introduced", "removed")).toBe("skip");
    expect(classifyTransition("prop", "on_screen", "on_screen")).toBe("no_op");
    expect(classifyTransition("prop", "on_screen", "teleported")).toBe("unknown_state");
  });
  it("character: identity_locked → variant_flagged is ok (drift = finding)", () => {
    expect(classifyTransition("character", "identity_locked", "variant_flagged")).toBe("ok");
  });
});

describe("P1 exit criterion — planner registers expected states", () => {
  it("registers a planned entity that the ledger then exposes", async () => {
    const e = await arc.registerPlannedEntity({
      production_id: PRODUCTION_ID,
      entity_id: "SC12-PROP-MUG-01",
      type: "prop",
      canonical_desc: "chipped enamel mug, left of the keyboard",
      expected_state: "introduced",
      scene: SCENE_ID,
      shot: "shot_2",
    });
    expect(e.status).toBe("planned");
    expect(e.current_state).toBe("introduced");

    // a gate can now look up what to expect — "gates have a ledger to check"
    const expected = await arc.expectedState("SC12-PROP-MUG-01", SCENE_ID);
    expect(expected).toBe("introduced");

    const facts = await arc.queryWorldState(PRODUCTION_ID, { status: "planned" });
    expect(facts.map((f) => f.entity_id)).toContain("SC12-PROP-MUG-01");
    expect(facts.every((f) => f.canonical === false)).toBe(true);
  });

  it("rejects an expected_state the machine does not define", async () => {
    await expect(
      arc.registerPlannedEntity({
        production_id: PRODUCTION_ID,
        type: "wardrobe",
        canonical_desc: "x",
        expected_state: "on_fire",
        scene: SCENE_ID,
      }),
    ).rejects.toThrow(/unknown expected_state/);
  });
});

describe("candidate observations vs canonical commit (B.2)", () => {
  it("observed states are candidate until the scene LOCKs", async () => {
    await arc.registerPlannedEntity({
      production_id: PRODUCTION_ID,
      entity_id: "SC12-PROP-MUG-01",
      type: "prop",
      canonical_desc: "enamel mug",
      expected_state: "introduced",
      scene: SCENE_ID,
      shot: "shot_2",
    });

    const obs = await arc.recordObservedState({
      entity_id: "SC12-PROP-MUG-01",
      observed_state: "moved",
      scene: SCENE_ID,
      shot: "shot_3",
      actor: "gate-continuity",
      evidence_uri: "gs://radar-dev-org-org_demo/evidence/x/frame.png",
    });
    expect(obs.verdict).toBe("skip"); // introduced → moved skips on_screen
    expect(obs.event.canonical).toBe(false);

    let facts = await arc.queryWorldState(PRODUCTION_ID, { text: "enamel mug" });
    expect(facts[0]?.canonical).toBe(false);
    expect(facts[0]?.current_state).toBe("moved");

    const res = await arc.commitCanonical(SCENE_ID, PRODUCTION_ID);
    expect(res.committed).toBeGreaterThan(0);

    facts = await arc.queryWorldState(PRODUCTION_ID, { text: "enamel mug" });
    expect(facts[0]?.canonical).toBe(true);
    expect(facts[0]?.current_state).toBe("moved");
  });

  it("state_events is an append-only log (immutable)", async () => {
    const before = (await storage.listStateEvents()).length;
    await arc.recordObservedState({
      entity_id: "SC12-PROP-CAN-01",
      observed_state: "removed",
      scene: SCENE_ID,
      shot: "shot_6",
      actor: "gate-continuity",
    });
    const after = await storage.listStateEvents();
    expect(after.length).toBe(before + 1);
    // earlier events unchanged
    expect(after.slice(0, before)).toEqual(
      (await storage.listStateEvents()).slice(0, before),
    );
  });

  it("emits worldstate.updated on the SSE channel", async () => {
    const seen: string[] = [];
    events.onSse((e) => seen.push(e.type));
    await arc.recordObservedState({
      entity_id: "SC12-PROP-CAN-01",
      observed_state: "removed",
      scene: SCENE_ID,
      shot: "shot_6",
      actor: "gate-continuity",
    });
    expect(seen).toContain("worldstate.updated");
  });
});

describe("queryWorldState — the generation/planning conditioning surface (F.2)", () => {
  it("returns canonical facts filtered by scene and state", async () => {
    const all = await arc.queryWorldState(PRODUCTION_ID);
    expect(all.length).toBeGreaterThanOrEqual(4); // seeded entities

    const active = await arc.queryWorldState(PRODUCTION_ID, { status: "active" });
    expect(active.every((f) => f.embedding_model_version === "gemini-embed-001@2026-03")).toBe(true);
  });
});
