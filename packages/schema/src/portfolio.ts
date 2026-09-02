import { z } from "zod";
import { Timestamp } from "./primitives.js";
import { TrustBand } from "./compliance.js";

/**
 * Portfolio / slate roll-up (Radar 2026 extension, roadmap R8).
 *
 * One executive view across a whole slate: every production's Trust Score and
 * deliverability at a glance, plus whether its E&O Underwriting Pack is bindable.
 * Deterministic roll-up over the same per-scene numbers — no new judgement (S1).
 */
export const PortfolioEntry = z
  .object({
    production_id: z.string().min(1),
    title: z.string(),
    lead_scene: z.string().nullable(),
    trust_score: z.number().min(0).max(100),
    trust_band: TrustBand,
    delivery_ready: z.boolean(),
    /** labels of jurisdictions/platforms that block delivery right now. */
    blocked_targets: z.array(z.string()).default([]),
    /** the E&O Underwriting Pack has no binding gaps. */
    bindable: z.boolean(),
    open_blocking: z.number().int().min(0),
    usd_spent: z.number().min(0),
  })
  .strict();
export type PortfolioEntry = z.infer<typeof PortfolioEntry>;

export const Portfolio = z
  .object({
    org_id: z.string().min(1),
    generated_at: Timestamp,
    entries: z.array(PortfolioEntry),
    /** slate-average Trust Score (0 when the slate is empty). */
    slate_trust: z.number().min(0).max(100),
    /** how many productions are delivery-ready / E&O-bindable right now. */
    deliverable_count: z.number().int().min(0),
    bindable_count: z.number().int().min(0),
    production_count: z.number().int().min(0),
  })
  .strict();
export type Portfolio = z.infer<typeof Portfolio>;
