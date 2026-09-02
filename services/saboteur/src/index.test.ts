import { describe, expect, it } from "vitest";
import { FixedClock } from "@scenelock/ports";
import { SceneBenchScorecard } from "@scenelock/schema";
import { Saboteur, CORPUS } from "./index.js";

const clock = new FixedClock("2026-08-29T19:00:00.000Z");

describe("Saboteur / SceneBench (spec §10, Part G)", () => {
  it("produces a schema-valid scorecard over the corpus", async () => {
    const card = await new Saboteur({ clock }).run();
    expect(SceneBenchScorecard.safeParse(card).success).toBe(true);
    expect(card.total_cases).toBe(CORPUS.length);
    expect(card.corpus_version).toMatch(/^scenebench-corpus@/);
  });

  it("catches every 'caught' evasion in the corpus", async () => {
    const card = await new Saboteur({ clock }).run();
    const missed = card.results.filter((r) => r.expectation === "caught" && r.outcome === "missed");
    expect(missed).toEqual([]);
  });

  it("raises no false positives on the 'clean' cases → FP rate 0 at τ", async () => {
    const card = await new Saboteur({ clock }).run();
    expect(card.results.filter((r) => r.outcome === "false_positive")).toEqual([]);
    expect(card.fp_rate_at_tau).toBe(0);
  });

  it("every per-class score meets its threshold → release_ok", async () => {
    const card = await new Saboteur({ clock }).run();
    for (const c of card.by_risk_class) {
      expect(c.pass, `${c.risk_class} ${c.catch_rate} < ${c.threshold}`).toBe(true);
    }
    expect(card.release_ok).toBe(true);
  });

  it("a regressed gate (τ so high the deterministic-1.0 check still fires but hybrids don't) is reflected", async () => {
    // sanity: with an impossible τ the ai_disclosure deterministic case still catches
    const card = await new Saboteur({ clock, tau: 0.999 }).run();
    const aidisc = card.by_risk_class.find((c) => c.risk_class === "ai_disclosure")!;
    expect(aidisc.catch_rate).toBe(1);
  });
});
