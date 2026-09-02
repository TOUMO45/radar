import { z } from "zod";
import { ProductionMode, Role } from "./primitives.js";

/**
 * org -> production hierarchy, settings/budgets, membership (B.1, B.2, E.7, E.12).
 */

export const CostCaps = z
  .object({
    veo_seconds_cap: z.number().min(0),
    gemini_token_cap: z.number().int().min(0),
    loop_attempts_cap: z.number().int().min(0),
    usd_cap: z.number().min(0).optional(),
  })
  .strict();
export type CostCaps = z.infer<typeof CostCaps>;

export const CostSpend = z
  .object({
    veo_seconds: z.number().min(0).default(0),
    gemini_tokens: z.number().int().min(0).default(0),
    loop_attempts: z.number().int().min(0).default(0),
    usd: z.number().min(0).default(0),
  })
  .strict();
export type CostSpend = z.infer<typeof CostSpend>;

export const ProductionSettings = z
  .object({
    /** confidence threshold tau, per production (spec §7). */
    tau: z.number().min(0).max(1).default(0.7),
    /** auto-regens per finding (spec §6). */
    loop_budget: z.number().int().min(0).default(2),
    cost_caps: CostCaps,
    config_version: z.string().min(1).default("v1"),
  })
  .strict();
export type ProductionSettings = z.infer<typeof ProductionSettings>;

export const Production = z
  .object({
    production_id: z.string().min(1),
    org_id: z.string().min(1),
    title: z.string().min(1),
    mode: ProductionMode.default("dry_run"),
    settings: ProductionSettings,
    spend: CostSpend.default({
      veo_seconds: 0,
      gemini_tokens: 0,
      loop_attempts: 0,
      usd: 0,
    }),
    kill_switch: z.boolean().default(false),
  })
  .strict();
export type Production = z.infer<typeof Production>;

export const Membership = z
  .object({
    user_id: z.string().min(1),
    org_id: z.string().min(1),
    role: Role,
  })
  .strict();
export type Membership = z.infer<typeof Membership>;

/** Portfolio rollup for the Productions home screen (S1). */
export const ProductionRollup = z
  .object({
    production: Production,
    scenes_by_status: z.record(z.string(), z.number().int().min(0)),
    open_blocking: z.number().int().min(0),
    usd_spent: z.number().min(0),
  })
  .strict();
export type ProductionRollup = z.infer<typeof ProductionRollup>;
