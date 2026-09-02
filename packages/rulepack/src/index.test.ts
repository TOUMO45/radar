import { describe, expect, it } from "vitest";
import type { ComplianceProfile, ShotProvenance } from "@scenelock/schema";
import { COVERED_JURISDICTIONS, COVERED_PLATFORMS, evaluateShot, RULES, ruleInForce } from "./index.js";

const NOW = "2026-09-02T00:00:00.000Z";

function prov(over: Partial<ShotProvenance> = {}): ShotProvenance {
  return {
    shot_id: "shot_x",
    is_ai_generated: true,
    is_deepfake: false,
    depicts_real_person: false,
    replica_kind: "none",
    subject_name: null,
    consent_record_id: null,
    c2pa: { present: true, valid: true, manifest_uri: null },
    watermark: { present: true, method: "synthid", detectable: true },
    perceptible_label: { present: false },
    generator: "veo-3",
    ...over,
  };
}

const profile = (over: Partial<ComplianceProfile> = {}): ComplianceProfile => ({
  production_id: "p_dry",
  territories: ["GLOBAL"],
  platforms: [],
  ...over,
});

const noConsent = () => false;
const withConsent = () => true;
const ids = (vs: { rule: { id: string } }[]) => vs.map((v) => v.rule.id).sort();

describe("rulepack — scoping", () => {
  it("GLOBAL rules always fire; territory rules only when the territory is targeted", () => {
    const p = prov({ watermark: { present: false, method: "none", detectable: false } });
    const global = evaluateShot(p, profile({ territories: ["GLOBAL"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(global)).toContain("global_watermark_present");
    expect(ids(global)).not.toContain("eu_ai_act_art50_2_machine_readable");

    const eu = evaluateShot(p, profile({ territories: ["GLOBAL", "EU"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(eu)).toContain("eu_ai_act_art50_2_machine_readable");
  });

  it("platform rules only fire when the platform is a delivery target", () => {
    // no valid C2PA and no visible label → TikTok can neither auto-detect nor see a label
    const p = prov({ is_deepfake: true, depicts_real_person: true, c2pa: null, perceptible_label: { present: false } });
    const none = evaluateShot(p, profile(), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(none)).not.toContain("tiktok_aigc_label");

    const tiktok = evaluateShot(p, profile({ platforms: ["tiktok"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(tiktok)).toContain("tiktok_aigc_label");
  });
});

describe("rulepack — EU AI Act Article 50", () => {
  it("50(2): missing watermark on an EU-targeted shot is a high violation", () => {
    const p = prov({ watermark: { present: false, method: "none", detectable: false } });
    const v = evaluateShot(p, profile({ territories: ["EU"] }), { hasActiveConsent: noConsent, now: NOW });
    const eu = v.find((x) => x.rule.id === "eu_ai_act_art50_2_machine_readable");
    expect(eu?.rule.severity).toBe("high");
    expect(eu?.rule.citation).toContain("Article 50(2)");
  });

  it("50(4): a real-person deepfake with no perceptible label is high; a label clears it", () => {
    const bad = prov({ is_deepfake: true, depicts_real_person: true, perceptible_label: { present: false } });
    const v1 = evaluateShot(bad, profile({ territories: ["EU"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(v1)).toContain("eu_ai_act_art50_4_deepfake_real_person_label");

    const labeled = prov({ is_deepfake: true, depicts_real_person: true, perceptible_label: { present: true } });
    const v2 = evaluateShot(labeled, profile({ territories: ["EU"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(v2)).not.toContain("eu_ai_act_art50_4_deepfake_real_person_label");
  });

  it("a fully-marked, labeled EU shot has no EU violations", () => {
    const clean = prov({
      is_deepfake: true,
      depicts_real_person: true,
      perceptible_label: { present: true },
      c2pa: { present: true, valid: true, manifest_uri: null },
      watermark: { present: true, method: "synthid", detectable: true },
    });
    const v = evaluateShot(clean, profile({ territories: ["EU"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(v.filter((x) => x.rule.scope.jurisdiction === "EU")).toHaveLength(0);
  });
});

describe("rulepack — California digital-replica law", () => {
  it("AB 1836: deceased-performer replica without consent is high; consent clears it", () => {
    const p = prov({ replica_kind: "deceased_performer", subject_name: "Vivian Marsh" });
    const noc = evaluateShot(p, profile({ territories: ["US_CA"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(noc)).toContain("ca_ab1836_deceased_replica_consent");

    const ok = evaluateShot(p, profile({ territories: ["US_CA"] }), { hasActiveConsent: withConsent, now: NOW });
    expect(ids(ok)).not.toContain("ca_ab1836_deceased_replica_consent");
  });

  it("AB 2602: living-performer replica without consent is a likeness_rights violation", () => {
    const p = prov({ replica_kind: "living_performer", subject_name: "A. Real" });
    const v = evaluateShot(p, profile({ territories: ["US_CA"] }), { hasActiveConsent: noConsent, now: NOW });
    const hit = v.find((x) => x.rule.id === "ca_ab2602_living_replica_consent");
    expect(hit?.rule.risk_class).toBe("likeness_rights");
  });
});

describe("rulepack — NY synthetic performer disclosure", () => {
  it("fires for a synthetic performer without a perceptible label", () => {
    const p = prov({ replica_kind: "synthetic_performer", subject_name: "Riya (synthetic)" });
    const v = evaluateShot(p, profile({ territories: ["US_NY"] }), { hasActiveConsent: noConsent, now: NOW });
    expect(ids(v)).toContain("ny_synthetic_performer_disclosure");
  });
});

describe("rulepack — R3 jurisdiction & platform expansion", () => {
  it("US federal: a real public figure's replica without consent is a high violation", () => {
    const p = prov({ replica_kind: "real_public_figure", depicts_real_person: true, subject_name: "Senator Alvarez" });
    const v = evaluateShot(p, profile({ territories: ["US_FEDERAL"] }), { hasActiveConsent: noConsent, now: NOW });
    const hit = v.find((x) => x.rule.id === "us_federal_digital_replica_consent");
    expect(hit?.rule.severity).toBe("high");
    // with consent on file, it clears
    expect(evaluateShot(p, profile({ territories: ["US_FEDERAL"] }), { hasActiveConsent: withConsent, now: NOW })
      .some((x) => x.rule.id === "us_federal_digital_replica_consent")).toBe(false);
  });

  it("China: an unlabeled AI shot trips BOTH the explicit and implicit label rules", () => {
    const p = prov({ perceptible_label: { present: false }, c2pa: null, watermark: { present: false, method: "none", detectable: false } });
    const v = ids(evaluateShot(p, profile({ territories: ["CN"] }), { hasActiveConsent: noConsent, now: NOW }));
    expect(v).toContain("cn_ai_content_explicit_label");
    expect(v).toContain("cn_ai_content_implicit_label");
  });

  it("China: a labeled + C2PA-marked shot satisfies both", () => {
    const p = prov({ perceptible_label: { present: true } });
    const v = ids(evaluateShot(p, profile({ territories: ["CN"] }), { hasActiveConsent: noConsent, now: NOW }));
    expect(v).not.toContain("cn_ai_content_explicit_label");
    expect(v).not.toContain("cn_ai_content_implicit_label");
  });

  it("UK: a realistic real-person deepfake without disclosure is flagged", () => {
    const p = prov({ is_deepfake: true, depicts_real_person: true, perceptible_label: { present: false }, c2pa: null, watermark: { present: false, method: "none", detectable: false } });
    const v = ids(evaluateShot(p, profile({ territories: ["UK"] }), { hasActiveConsent: noConsent, now: NOW }));
    expect(v).toContain("uk_realistic_deepfake_disclosure");
  });

  it("Australia: a synthetic performer with no disclosure is flagged", () => {
    const p = prov({ replica_kind: "synthetic_performer", perceptible_label: { present: false }, c2pa: null, watermark: { present: false, method: "none", detectable: false } });
    const v = ids(evaluateShot(p, profile({ territories: ["AU"] }), { hasActiveConsent: noConsent, now: NOW }));
    expect(v).toContain("au_broadcast_synthetic_voice_disclosure");
  });

  it("new platforms (Instagram, X, theatrical) fire only when targeted", () => {
    // fully undisclosed: no C2PA, no watermark, no label
    const p = prov({ is_deepfake: true, depicts_real_person: true, c2pa: null, perceptible_label: { present: false }, watermark: { present: false, method: "none", detectable: false } });
    const none = ids(evaluateShot(p, profile(), { hasActiveConsent: noConsent, now: NOW }));
    expect(none).not.toContain("instagram_ai_info_label");
    const ig = ids(evaluateShot(p, profile({ platforms: ["instagram", "x", "theatrical"] }), { hasActiveConsent: noConsent, now: NOW }));
    expect(ig).toContain("x_synthetic_media_label");
    expect(ig).toContain("theatrical_dcp_provenance");
    // instagram fires on any AI shot lacking disclosure
    expect(ig).toContain("instagram_ai_info_label");
  });

  it("covers the expanded jurisdiction & platform sets", () => {
    expect(COVERED_JURISDICTIONS).toEqual(expect.arrayContaining(["US_FEDERAL", "AU", "UK", "CN"]));
    expect(COVERED_PLATFORMS).toEqual(expect.arrayContaining(["instagram", "x", "theatrical"]));
  });
});

describe("rulepack — integrity", () => {
  it("every rule has a citation, effective date and a distinct id", () => {
    const seen = new Set<string>();
    for (const r of RULES) {
      expect(r.citation.length).toBeGreaterThan(3);
      expect(r.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
    }
  });

  it("a pristine shot (marked, labeled, consented) with no targets yields nothing", () => {
    const clean = prov({ perceptible_label: { present: true } });
    expect(evaluateShot(clean, profile(), { hasActiveConsent: withConsent, now: NOW })).toHaveLength(0);
  });

  it("covers EU, CA, NY jurisdictions and the major platforms", () => {
    expect(COVERED_JURISDICTIONS).toEqual(expect.arrayContaining(["GLOBAL", "EU", "US_CA", "US_NY"]));
    expect(COVERED_PLATFORMS).toEqual(expect.arrayContaining(["tiktok", "youtube", "meta", "svod"]));
  });

  it("ruleInForce returns the target that activated the rule", () => {
    const eu = RULES.find((r) => r.id === "eu_ai_act_art50_2_machine_readable")!;
    expect(ruleInForce(eu, profile({ territories: ["EU"] }))).toBe("EU");
    expect(ruleInForce(eu, profile({ territories: ["US_CA"] }))).toBeNull();
  });
});
