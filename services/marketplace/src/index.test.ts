import { describe, expect, it } from "vitest";
import { mockLikenessMarketplace as mkt } from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";

describe("MockLikenessMarketplace", () => {
  it("only the estate provider is eligible for a deceased performer", () => {
    const qs = mkt.quotes({ subject: "Vivian Marsh", replica_kind: "deceased_performer", now: NOW });
    expect(qs).toHaveLength(3);
    const eligible = qs.filter((q) => q.eligible).map((q) => q.provider);
    expect(eligible).toEqual(["cmg_worldwide"]);
  });

  it("living-performer likenesses are handled by Vermillio + Loti", () => {
    const qs = mkt.quotes({ subject: "Riya Kapoor", replica_kind: "living_performer", now: NOW });
    const eligible = qs.filter((q) => q.eligible).map((q) => q.provider).sort();
    expect(eligible).toEqual(["loti", "vermillio"]);
  });

  it("quotes are deterministic (same inputs → same quote)", () => {
    const a = mkt.quotes({ subject: "Vivian Marsh", replica_kind: "deceased_performer", now: NOW });
    const b = mkt.quotes({ subject: "Vivian Marsh", replica_kind: "deceased_performer", now: NOW });
    expect(a).toEqual(b);
  });

  it("executing a quote yields an active, filed licensing consent record", () => {
    const q = mkt.quotes({ subject: "Vivian Marsh", replica_kind: "deceased_performer", now: NOW }).find((x) => x.eligible)!;
    const clr = mkt.execute(q, { production_id: "p_dry", consent_id: "cr_new", uploaded_by: "producer", now: NOW });
    expect(clr.consent.status).toBe("active");
    expect(clr.consent.kind).toBe("licensing");
    expect(clr.consent.subject).toBe("Vivian Marsh");
    expect(clr.consent.doc_uri).toContain("cmg_worldwide");
    expect(clr.provider).toBe("cmg_worldwide");
  });
});
