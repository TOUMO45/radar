import { z } from "zod";
import { Timestamp } from "./primitives.js";
import { ReplicaKind } from "./compliance.js";
import { ConsentRecord } from "./consent.js";

/**
 * Likeness-rights marketplace (Radar 2026 extension, roadmap R5).
 *
 * When a `likeness_rights` finding fires (CA AB 1836 / AB 2602, US federal), a
 * dead end is useless — a producer needs a *path to clear it*. R5 offers one:
 * request quotes from digital-replica licensing providers (Vermillio / Loti /
 * estate agencies), execute one, and auto-attach the resulting consent record so
 * the finding resolves. Deterministic mock provider today, real partner API later
 * (behind the `LikenessMarketplacePort` seam). Model-free (S1).
 */

export const LikenessProvider = z.enum([
  "vermillio", // TraceID licensing (living + estate)
  "loti", // Loti AI likeness protection & licensing
  "cmg_worldwide", // estate / deceased-personality licensing
]);
export type LikenessProvider = z.infer<typeof LikenessProvider>;

export const LikenessQuote = z
  .object({
    quote_id: z.string().min(1),
    provider: LikenessProvider,
    provider_label: z.string(),
    subject: z.string().min(1),
    replica_kind: ReplicaKind,
    /** what the licence grants (e.g. "synthetic performance, worldwide, 1 title"). */
    scope: z.string(),
    est_price_usd: z.number().min(0),
    turnaround_days: z.number().int().min(0),
    terms_url: z.string(),
    /** whether this provider handles this replica kind at all. */
    eligible: z.boolean(),
  })
  .strict();
export type LikenessQuote = z.infer<typeof LikenessQuote>;

export const LikenessClearance = z
  .object({
    quote_id: z.string().min(1),
    provider: LikenessProvider,
    subject: z.string().min(1),
    consent: ConsentRecord,
    cleared_at: Timestamp,
  })
  .strict();
export type LikenessClearance = z.infer<typeof LikenessClearance>;
