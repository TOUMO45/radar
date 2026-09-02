import { describe, expect, it } from "vitest";
import { CONTROL_ROOM_TOKENS, PRODUCTION_DEFAULTS, DEGRADED_TAU_BUMP, attemptUsd } from "./index.js";

describe("@scenelock/config", () => {
  it("carries the Control Room palette (C.4)", () => {
    expect(CONTROL_ROOM_TOKENS.bg.base).toBe("#0B0E14");
    expect(CONTROL_ROOM_TOKENS.status.locked).toBe("#2BD576");
    expect(CONTROL_ROOM_TOKENS.source.deterministic).toBe("#22CCEE");
  });

  it("τ default is 0.70, loop budget 2 (spec §6/§7)", () => {
    expect(PRODUCTION_DEFAULTS.tau).toBe(0.7);
    expect(PRODUCTION_DEFAULTS.loop_budget).toBe(2);
    expect(DEGRADED_TAU_BUMP).toBe(0.1);
  });

  it("attemptUsd sums Veo seconds + Gemini tokens", () => {
    expect(attemptUsd(0, 0)).toBe(0);
    expect(attemptUsd(8, 42_000)).toBeCloseTo(8 * 0.35 + 42 * 0.0025, 6);
  });
});
