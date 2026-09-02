import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage, SeqIdGen } from "@scenelock/ports";
import { IncidentWatchdog } from "./index.js";

const clock = new FixedClock("2026-08-29T15:30:00.000Z");
let storage: InMemoryStorage;
let events: InMemoryEventBus;
let wd: IncidentWatchdog;

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  wd = new IncidentWatchdog({ storage, clock, ids: new SeqIdGen(), events });
});

describe("IncidentWatchdog (C.3 Flow B, E.11)", () => {
  it("opens one incident per blocking finding, assigned to the Fixer", async () => {
    const { opened } = await wd.sweep("p_dry", 0.7);
    const incidents = await storage.listIncidents("p_dry");
    // seed has 3 blocking findings
    expect(opened).toHaveLength(3);
    expect(incidents).toHaveLength(3);
    expect(incidents.every((i) => i.assignee === "fixer" && i.status === "open")).toBe(true);
    expect(new Set(incidents.map((i) => i.finding_id))).toEqual(
      new Set(["f_can_teleport", "f_real_person", "f_ai_disclosure"]),
    );
  });

  it("is idempotent — a second sweep opens nothing new", async () => {
    await wd.sweep("p_dry", 0.7);
    const { opened, closed } = await wd.sweep("p_dry", 0.7);
    expect(opened).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("auto-closes with a resolution note when the finding is waived", async () => {
    await wd.sweep("p_dry", 0.7);
    const f = (await storage.getFinding("f_real_person"))!;
    await storage.putFinding({
      ...f,
      status: "waived",
      adjudication: { by: "u_producer", decision: "waive", reason: "license 4417-EU on file", at: clock.now() },
    });
    const { closed } = await wd.sweep("p_dry", 0.7);
    expect(closed).toHaveLength(1);
    const inc = (await storage.listIncidents("p_dry")).find((i) => i.finding_id === "f_real_person")!;
    expect(inc.status).toBe("closed");
    expect(inc.note).toContain("waived");
    expect(inc.closed_at).not.toBeNull();
  });

  it("emits incident.opened / incident.closed on the SSE channel", async () => {
    const seen: string[] = [];
    events.onSse((e) => seen.push(e.type));
    await wd.onFinding((await storage.getFinding("f_ai_disclosure"))!, 0.7);
    const f = (await storage.getFinding("f_ai_disclosure"))!;
    await storage.putFinding({ ...f, status: "resolved" });
    await wd.onFinding((await storage.getFinding("f_ai_disclosure"))!, 0.7);
    expect(seen).toEqual(["incident.opened", "incident.closed"]);
  });

  it("does not open incidents for non-blocking findings", async () => {
    await wd.onFinding((await storage.getFinding("f_jacket_missing"))!, 0.7); // medium
    await wd.onFinding((await storage.getFinding("f_preflight_lyric"))!, 0.7); // preflight
    expect(await storage.listIncidents("p_dry")).toHaveLength(0);
  });

  it("reopens if a resolved finding goes blocking again", async () => {
    await wd.onFinding((await storage.getFinding("f_can_teleport"))!, 0.7);
    const f = (await storage.getFinding("f_can_teleport"))!;
    await storage.putFinding({ ...f, status: "resolved" });
    await wd.onFinding((await storage.getFinding("f_can_teleport"))!, 0.7);
    await storage.putFinding({ ...(await storage.getFinding("f_can_teleport"))!, status: "open" });
    await wd.onFinding((await storage.getFinding("f_can_teleport"))!, 0.7);
    const incs = (await storage.listIncidents("p_dry")).filter((i) => i.finding_id === "f_can_teleport");
    expect(incs).toHaveLength(2);
    expect(incs.filter((i) => i.status === "open")).toHaveLength(1);
  });
});
