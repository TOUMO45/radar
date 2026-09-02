import type {
  LikenessClearance,
  LikenessProvider,
  LikenessQuote,
  ReplicaKind,
} from "@scenelock/schema";

/**
 * LikenessMarketplacePort (roadmap R5) — the seam to digital-replica licensing
 * providers. The DRY_RUN adapter returns deterministic quotes and issues a
 * consent record; a real integration (Vermillio / Loti) drops in behind the
 * same interface with a partner API key.
 */
export interface LikenessQuoteInput {
  subject: string;
  replica_kind: ReplicaKind;
  /** production/title the licence is for (shapes scope + price). */
  production_title?: string;
  now: string;
}

export interface LikenessMarketplacePort {
  /** Request quotes from every provider that handles this replica kind. */
  quotes(input: LikenessQuoteInput): LikenessQuote[];
  /**
   * Execute a specific quote → a consent record ready to file. `consent_id` and
   * `uploaded_by` are supplied by the caller (id-gen / actor).
   */
  execute(
    quote: LikenessQuote,
    ctx: { production_id: string; consent_id: string; uploaded_by: string; now: string },
  ): LikenessClearance;

  readonly id: string;
}
