import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage } from "@scenelock/ports";
import { MediaArtifacts } from "@scenelock/schema";
import { DryRunMediaBackend, MediaProcessor } from "./index.js";

const clock = new FixedClock("2026-08-29T15:10:00.000Z");
let storage: InMemoryStorage;
let events: InMemoryEventBus;
let mp: MediaProcessor;

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  mp = new MediaProcessor({
    storage,
    clock,
    events,
    backend: new DryRunMediaBackend(() => clock.now()),
  });
});

describe("media-processor (E.1)", () => {
  it("produces schema-valid artifacts and persists them", async () => {
    const a = await mp.process("shot_1");
    expect(MediaArtifacts.safeParse(a).success).toBe(true);
    expect((await storage.getMediaArtifacts("shot_1"))?.content_hash).toBe(a.content_hash);
    expect(a.audio.sample_rate_hz).toBe(16000);
    expect(a.keyframes.fps).toBe(1);
  });

  it("valid C2PA read carries generator == veo_job_id (payload-swap surface, E.5.2)", async () => {
    const a = await mp.process("shot_1");
    expect(a.c2pa.present).toBe(true);
    expect(a.c2pa.valid).toBe(true);
    expect(a.c2pa.generator).toBe("veo-job-shot_1");
    expect(a.c2pa.signer_chain_ok).toBe(true);
  });

  it("shot_6 (no manifest) → present:false, generator:null", async () => {
    const a = await mp.process("shot_6");
    expect(a.c2pa).toMatchObject({ present: false, valid: false, generator: null });
  });

  it("carries the ASR transcript from the shot's audio cue", async () => {
    const a = await mp.process("shot_4");
    expect(a.transcript.toLowerCase()).toContain("storm");
    expect(a.transcript).toBe("hmm a storm threatening my life fading away today");
  });

  it("emits shots.processed on the bus", async () => {
    const seen: string[] = [];
    events.subscribe("shots.processed", (e) => seen.push((e.payload as MediaArtifacts).shot_id));
    await mp.process("shot_2");
    expect(seen).toEqual(["shot_2"]);
  });

  it("subscribe() wires shots.raw → shots.processed", async () => {
    const off = mp.subscribe();
    const seen: string[] = [];
    events.subscribe("shots.processed", (e) => seen.push((e.payload as MediaArtifacts).shot_id));
    await events.publish("shots.raw", { shot_id: "shot_3" }, { ordering_key: "shot_3" });
    expect(seen).toEqual(["shot_3"]);
    off();
  });

  it("throws on unknown shot", async () => {
    await expect(mp.process("shot_999")).rejects.toThrow(/unknown shot/);
  });
});
