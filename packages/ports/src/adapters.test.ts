import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryStorage } from "./storage.js";
import { InMemoryEventBus } from "./events.js";
import { SeqIdGen, FixedClock } from "./index.js";

describe("InMemoryStorage — StoragePort contract (stands in for Firestore, E.7)", () => {
  let s: InMemoryStorage;
  beforeEach(async () => {
    s = new InMemoryStorage();
    await s.reset();
  });

  it("serves the seeded production / scene / shots", async () => {
    expect(await s.listProductions("org_demo")).toHaveLength(1);
    expect(await s.listProductions("org_other")).toHaveLength(0);
    expect((await s.getScene("sc_12"))?.scene_id).toBe("sc_12");
    expect(await s.listShots("sc_12")).toHaveLength(6);
  });

  it("filters findings", async () => {
    const blocking = await s.listFindings("p_dry", { blocking: true });
    expect(blocking.length).toBe(3);
    const preflight = await s.listFindings("p_dry", { stage: "preflight" });
    expect(preflight.length).toBe(1);
  });

  it("append-only adjudications + state events", async () => {
    const ts = "2026-08-29T16:00:00.000Z";
    await s.appendAdjudication({ finding_id: "f_identity_drift", by: "u1", decision: "confirm", reason: "ok", at: ts });
    await s.appendAdjudication({ finding_id: "f_identity_drift", by: "u2", decision: "override", reason: "no", at: ts });
    expect(await s.listAdjudications("f_identity_drift")).toHaveLength(2);

    const before = (await s.listStateEvents()).length;
    await s.appendStateEvent({
      entity_id: "SC12-PROP-CAN-01", from: "on_screen", to: "removed", scene: "sc_12", shot: "shot_6",
      evidence_uri: null, actor: "gate-continuity", canonical: false, ts,
    });
    expect((await s.listStateEvents()).length).toBe(before + 1);
    expect((await s.listStateEvents("SC12-PROP-CAN-01")).every((e) => e.entity_id === "SC12-PROP-CAN-01")).toBe(true);
  });

  it("upserts entities", async () => {
    const e = await s.getEntity("SC12-PROP-CAN-01");
    expect(e).not.toBeNull();
    await s.putEntity({ ...e!, canonical_desc: "changed" });
    expect((await s.getEntity("SC12-PROP-CAN-01"))?.canonical_desc).toBe("changed");
  });
});

describe("InMemoryEventBus — EventBusPort (stands in for Pub/Sub, E.2)", () => {
  it("delivers to topic subscribers with an envelope", async () => {
    const bus = new InMemoryEventBus(() => "2026-01-01T00:00:00.000Z");
    const got: unknown[] = [];
    const off = bus.subscribe("gates.results", (e) => got.push(e));
    await bus.publish("gates.results", { shot_id: "shot_1" }, { ordering_key: "shot_1" });
    expect(got).toHaveLength(1);
    expect((got[0] as { topic: string }).topic).toBe("gates.results");
    off();
    await bus.publish("gates.results", {});
    expect(got).toHaveLength(1);
  });

  it("fans out SSE events", () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.onSse((e) => seen.push(e.type));
    bus.emitSse({ type: "system.degraded", data: { component: "archivist", mode: "reference_only" } });
    expect(seen).toEqual(["system.degraded"]);
  });
});

describe("test seams", () => {
  it("FixedClock + SeqIdGen are deterministic", () => {
    const c = new FixedClock("2026-05-05T05:05:05.000Z");
    expect(c.now()).toBe("2026-05-05T05:05:05.000Z");
    const ids = new SeqIdGen();
    expect([ids.next("f"), ids.next("f"), ids.next("d")]).toEqual(["f_1", "f_2", "d_1"]);
  });
});
