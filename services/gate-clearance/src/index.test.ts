import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock, InMemoryEventBus, InMemoryStorage } from "@scenelock/ports";
import { Finding, computeBlocking } from "@scenelock/schema";
import { DryRunMediaBackend, MediaProcessor } from "@scenelock/media-processor";
import { GateClearance } from "./index.js";
import { windowMatch, editSimilarity } from "./match.js";

const clock = new FixedClock("2026-08-29T15:20:00.000Z");
let storage: InMemoryStorage;
let events: InMemoryEventBus;
let gate: GateClearance;

async function processAll() {
  const mp = new MediaProcessor({
    storage,
    clock,
    events,
    backend: new DryRunMediaBackend(() => clock.now()),
  });
  for (const s of await storage.listShots("sc_12")) await mp.process(s.shot_id);
}

beforeEach(async () => {
  storage = new InMemoryStorage();
  await storage.reset();
  events = new InMemoryEventBus(() => clock.now());
  gate = new GateClearance({ storage, clock, events });
  await processAll();
});

describe("gate-clearance (E.5.2)", () => {
  it("shot_6: missing C2PA → deterministic ai_disclosure finding, confidence 1.0", async () => {
    const { findings, gate_runs } = await gate.runShot("shot_6");
    const f = findings.find((x) => x.risk_class === "ai_disclosure");
    expect(f).toBeDefined();
    expect(f!.source).toBe("deterministic");
    expect(f!.confidence).toBe(1.0);
    expect(f!.rule).toBe("c2pa_manifest_absent");
    expect(Finding.safeParse(f).success).toBe(true);
    expect(gate_runs.map((r) => `${r.gate}/${r.sub_gate ?? "-"}`)).toEqual([
      "clearance/-",
      "clearance/audio",
    ]);
  });

  it("shot_1..5: valid C2PA whose generator matches veo_job_id → no ai_disclosure finding", async () => {
    for (const id of ["shot_1", "shot_2", "shot_3", "shot_4", "shot_5"]) {
      const { findings } = await gate.runShot(id);
      expect(findings.some((f) => f.risk_class === "ai_disclosure")).toBe(false);
    }
  });

  it("detects a C2PA payload-swap (generator ≠ veo_job_id)", async () => {
    const shot = (await storage.getShot("shot_2"))!;
    const media = (await storage.getMediaArtifacts("shot_2"))!;
    await storage.putMediaArtifacts({ ...media, c2pa: { ...media.c2pa, generator: "veo-job-OTHER" } });
    const { findings } = await gate.runShot("shot_2");
    const f = findings.find((x) => x.risk_class === "ai_disclosure");
    expect(f?.rule).toBe("c2pa_generator_mismatch");
    expect(f?.confidence).toBe(1.0);
  });

  it("shot_4: names Senator Hargrove with no active consent → real_person, confidence 1.0", async () => {
    const { findings } = await gate.runShot("shot_4");
    const f = findings.find((x) => x.risk_class === "real_person");
    expect(f).toBeDefined();
    expect(f!.source).toBe("deterministic");
    expect(f!.confidence).toBe(1.0);
    expect(f!.evidence_quote).toContain("Hargrove");
    expect(computeBlocking(f!, 0.7)).toBe(true);
  });

  it("real_person clears once an active consent record exists", async () => {
    await storage.putConsentRecord({
      record_id: "consent_new",
      production_id: "p_dry",
      subject: "Senator Dale Hargrove",
      kind: "release",
      linked_entity_id: null,
      linked_figure_node_id: "figure_hargrove",
      doc_uri: null,
      expiry: null,
      status: "active",
      redaction_status: "clean",
      uploaded_by: "u_legal",
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const { findings } = await gate.runShot("shot_4");
    expect(findings.some((f) => f.risk_class === "real_person")).toBe(false);
  });

  it("shot_3: noisy OCR label near-matches a brand → trademark finding, below τ (non-blocking)", async () => {
    const { findings } = await gate.runShot("shot_3");
    const f = findings.find((x) => x.risk_class === "trademark");
    expect(f).toBeDefined();
    expect(f!.source).toBe("hybrid");
    expect(f!.confidence).toBeGreaterThan(0.55);
    expect(f!.confidence).toBeLessThan(0.7); // ambiguous read — must NOT block
    expect(computeBlocking(f!, 0.7)).toBe(false);
    expect(f!.measurement?.metric).toBe("label_edit_similarity");
  });

  it("shot_4: hummed reference lyric → lyrics finding on the audio sub-gate, below τ", async () => {
    const { findings } = await gate.runShot("shot_4");
    const f = findings.find((x) => x.risk_class === "lyrics");
    expect(f).toBeDefined();
    expect(f!.sub_gate).toBe("audio");
    expect(f!.source).toBe("hybrid");
    expect(f!.confidence).toBeGreaterThan(0.55);
    expect(f!.confidence).toBeLessThan(0.7);
  });

  it("full scene sweep: exactly the expected clearance findings, 2 blocking", async () => {
    const all: Finding[] = [];
    for (const s of await storage.listShots("sc_12")) {
      const { findings } = await gate.runShot(s.shot_id);
      all.push(...findings);
    }
    const byClass = all.map((f) => `${f.shot_id}:${f.risk_class}`).sort();
    expect(byClass).toEqual([
      "shot_3:trademark",
      "shot_4:lyrics",
      "shot_4:real_person",
      "shot_6:ai_disclosure",
    ]);
    const blocking = all.filter((f) => computeBlocking(f, 0.7));
    expect(blocking.map((f) => f.risk_class).sort()).toEqual(["ai_disclosure", "real_person"]);
    for (const f of all) expect(Finding.safeParse(f).success).toBe(true);
  });

  it("every emitted finding carries a deterministic, re-runnable id", async () => {
    const a = await gate.runShot("shot_4");
    const b = await gate.runShot("shot_4");
    expect(a.findings.map((f) => f.finding_id)).toEqual(b.findings.map((f) => f.finding_id));
  });
});

describe("match primitives", () => {
  it("windowMatch scores near-verbatim high, paraphrase mid, unrelated ~0", () => {
    const ref = "oh a storm is threatening my very life today";
    expect(windowMatch(ref, ref, 8)).toBe(1);
    expect(windowMatch("hmm a storm threatening my life fading away today", ref, 8)).toBeGreaterThan(0.5);
    expect(windowMatch("the quarterly numbers look fine", ref, 8)).toBeLessThan(0.2);
  });
  it("editSimilarity is 1 for equal, lower for corrupted", () => {
    expect(editSimilarity("COLARA CLASSIC", "colara classic")).toBe(1);
    expect(editSimilarity("COIA  CLASSIC", "COLARA CLASSIC")).toBeLessThan(0.9);
  });
});
