import type {
  LikenessMarketplacePort,
  LikenessQuoteInput,
} from "@scenelock/ports";
import type {
  ConsentRecord,
  LikenessClearance,
  LikenessProvider,
  LikenessQuote,
  ReplicaKind,
} from "@scenelock/schema";

/**
 * Deterministic mock digital-replica licensing marketplace (roadmap R5).
 *
 * Real workflow, mock provider: quote → execute → a filed consent record. Prices
 * and turnarounds are illustrative but provider *coverage* is realistic — CMG
 * handles estates (deceased), Vermillio + Loti handle living/synthetic likenesses.
 * Swap `MockLikenessMarketplace` for a partner integration behind the port.
 */

interface ProviderDef {
  provider: LikenessProvider;
  label: string;
  handles: ReplicaKind[];
  base_price_usd: number;
  turnaround_days: number;
  terms_url: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    provider: "vermillio",
    label: "Vermillio (TraceID)",
    handles: ["living_performer", "synthetic_performer", "real_public_figure"],
    base_price_usd: 12000,
    turnaround_days: 5,
    terms_url: "https://vermillio.com/traceid",
  },
  {
    provider: "loti",
    label: "Loti AI",
    handles: ["living_performer", "real_public_figure"],
    base_price_usd: 8000,
    turnaround_days: 7,
    terms_url: "https://loti.ai/licensing",
  },
  {
    provider: "cmg_worldwide",
    label: "CMG Worldwide (estates)",
    handles: ["deceased_performer"],
    base_price_usd: 25000,
    turnaround_days: 14,
    terms_url: "https://cmgworldwide.com/digital-replica",
  },
];

const SCOPE: Record<ReplicaKind, string> = {
  none: "n/a",
  living_performer: "living-performer digital replica — worldwide, 1 title, term 5y",
  deceased_performer: "deceased-performer digital replica — estate consent, worldwide, 1 title",
  synthetic_performer: "synthetic-performer identity licence — worldwide, perpetual",
  real_public_figure: "public-figure depiction licence — worldwide, 1 title, term 3y",
};

export class MockLikenessMarketplace implements LikenessMarketplacePort {
  readonly id = "mock-likeness-marketplace";

  quotes(input: LikenessQuoteInput): LikenessQuote[] {
    const slug = input.subject.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12) || "subject";
    return PROVIDERS.map((p) => {
      const eligible = p.handles.includes(input.replica_kind);
      // deterministic price nudge from subject length (stands in for a real quote)
      const priceAdj = (input.subject.length % 5) * 500;
      return {
        quote_id: `q_${p.provider}_${slug}`,
        provider: p.provider,
        provider_label: p.label,
        subject: input.subject,
        replica_kind: input.replica_kind,
        scope: SCOPE[input.replica_kind],
        est_price_usd: p.base_price_usd + priceAdj,
        turnaround_days: p.turnaround_days,
        terms_url: p.terms_url,
        eligible,
      };
    });
  }

  execute(
    quote: LikenessQuote,
    ctx: { production_id: string; consent_id: string; uploaded_by: string; now: string },
  ): LikenessClearance {
    const consent: ConsentRecord = {
      record_id: ctx.consent_id,
      production_id: ctx.production_id,
      subject: quote.subject,
      kind: "licensing",
      linked_entity_id: null,
      linked_figure_node_id: null,
      doc_uri: `gs://radar-licenses/${quote.provider}/${quote.quote_id}.pdf`,
      expiry: null,
      status: "active",
      redaction_status: "clean",
      uploaded_by: ctx.uploaded_by,
      created_at: ctx.now,
    };
    return {
      quote_id: quote.quote_id,
      provider: quote.provider,
      subject: quote.subject,
      consent,
      cleared_at: ctx.now,
    };
  }
}

export const mockLikenessMarketplace = new MockLikenessMarketplace();
