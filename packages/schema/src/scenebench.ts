import { z } from "zod";
import { RiskClass, Timestamp } from "./primitives.js";

/**
 * Saboteur / SceneBench (spec §10, Part G). On any gate change, the versioned
 * evasion corpus runs; a release is blocked if catch-rate drops below per-class
 * thresholds or the FP rate at τ rises.
 */
export const EvasionResult = z
  .object({
    case_id: z.string().min(1),
    risk_class: RiskClass,
    expectation: z.enum(["caught", "clean"]),
    outcome: z.enum(["caught", "missed", "false_positive", "clean"]),
    detail: z.string().default(""),
  })
  .strict();
export type EvasionResult = z.infer<typeof EvasionResult>;

export const ClassScore = z
  .object({
    risk_class: RiskClass,
    cases: z.number().int().min(0),
    caught: z.number().int().min(0),
    catch_rate: z.number().min(0).max(1),
    threshold: z.number().min(0).max(1),
    pass: z.boolean(),
  })
  .strict();
export type ClassScore = z.infer<typeof ClassScore>;

export const SceneBenchScorecard = z
  .object({
    corpus_version: z.string().min(1),
    generated_at: Timestamp,
    tau: z.number().min(0).max(1),
    total_cases: z.number().int().min(0),
    fp_rate_at_tau: z.number().min(0).max(1),
    fp_rate_threshold: z.number().min(0).max(1),
    by_risk_class: z.array(ClassScore),
    results: z.array(EvasionResult),
    release_ok: z.boolean(),
  })
  .strict();
export type SceneBenchScorecard = z.infer<typeof SceneBenchScorecard>;
