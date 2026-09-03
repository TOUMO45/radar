import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { c2patoolAvailable } from "@scenelock/provenance";
import { runQuickScan } from "./index.js";

const NOW = "2026-09-03T00:00:00.000Z";
const fixture = (name: string) =>
  fileURLToPath(new URL(`../../provenance/test-fixtures/${name}`, import.meta.url));

describe("runQuickScan — text input", () => {
  it("flags a real, well-known trademark mentioned in ordinary text", async () => {
    const r = await runQuickScan(
      { kind: "text", text: "She laced up her Nike running shoes before heading out the door." },
      NOW,
    );
    expect(r.findings.some((f) => f.risk_class === "trademark" && f.subject === "Nike")).toBe(true);
    expect(r.disclaimer).toBe("Quick Scan flags possible matches; it does not verify licensing status. It is not legal advice.");
  });

  it("flags a real, well-known (public-domain) song lyric", async () => {
    const r = await runQuickScan(
      { kind: "text", text: "The child hummed: twinkle twinkle little star, how I wonder what you are." },
      NOW,
    );
    const hit = r.findings.find((f) => f.risk_class === "lyrics");
    expect(hit).toBeTruthy();
    expect(hit!.subject).toBe("Twinkle, Twinkle, Little Star");
    expect(hit!.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("clean, generic text produces zero findings — no false positive", async () => {
    const r = await runQuickScan(
      { kind: "text", text: "The quarterly report showed steady growth across every region this year." },
      NOW,
    );
    expect(r.findings).toHaveLength(0);
  });

  it("always reports continuity as not_applicable, never silently omitted", async () => {
    const r = await runQuickScan({ kind: "text", text: "anything" }, NOW);
    expect(r.not_applicable.some((n) => n.axis === "continuity")).toBe(true);
  });

  it("always reports the consent half of real_person as not_applicable", async () => {
    const r = await runQuickScan({ kind: "text", text: "anything" }, NOW);
    expect(r.not_applicable.some((n) => n.axis === "real_person.consent")).toBe(true);
  });

  it("marks ai_disclosure and compliance_labeling not_applicable for a text-only scan", async () => {
    const r = await runQuickScan({ kind: "text", text: "anything" }, NOW);
    const axes = r.not_applicable.map((n) => n.axis);
    expect(axes).toContain("ai_disclosure");
    expect(axes).toContain("compliance_labeling");
  });

  it("scan_id is unique per call and input_type is recorded", async () => {
    const a = await runQuickScan({ kind: "text", text: "x" }, NOW);
    const b = await runQuickScan({ kind: "text", text: "x" }, NOW);
    expect(a.scan_id).not.toBe(b.scan_id);
    expect(a.input_type).toBe("text");
  });
});

describe("runQuickScan — asset (image) input", () => {
  it("marks trademark/lyrics/real_person not_applicable for a media scan (no text extracted)", async () => {
    const r = await runQuickScan({ kind: "image", assetPath: fixture("no-manifest.jpg") }, NOW);
    const axes = r.not_applicable.map((n) => n.axis);
    expect(axes).toContain("trademark");
    expect(axes).toContain("lyrics");
    expect(axes).toContain("real_person");
    expect(axes).toContain("continuity");
    expect(axes).toContain("real_person.consent");
  });

  it("a plain image with no C2PA manifest is reported as absent, not faked", async () => {
    const r = await runQuickScan({ kind: "image", assetPath: fixture("no-manifest.jpg") }, NOW);
    const c2pa = r.findings.find((f) => f.risk_class === "ai_disclosure");
    expect(c2pa).toBeTruthy();
    expect(c2pa!.rule).toBe("quickscan_c2pa_absent");
  });
});

describe.skipIf(!c2patoolAvailable())("runQuickScan — asset input, LIVE c2patool", () => {
  it("a genuine C2PA-signed image verifies as present+valid, and the plain image genuinely differs", async () => {
    const signed = await runQuickScan({ kind: "image", assetPath: fixture("signed-ai.jpg") }, NOW);
    const plain = await runQuickScan({ kind: "image", assetPath: fixture("no-manifest.jpg") }, NOW);

    const signedC2pa = signed.findings.find((f) => f.risk_class === "ai_disclosure")!;
    const plainC2pa = plain.findings.find((f) => f.risk_class === "ai_disclosure")!;

    expect(signedC2pa.rule).toBe("quickscan_c2pa_verified");
    expect(plainC2pa.rule).toBe("quickscan_c2pa_absent");
    expect(signedC2pa.rule).not.toBe(plainC2pa.rule); // genuinely different results, not the same canned response

    // the compliance-labeling finding should differ too: the signed asset has a
    // valid manifest, so the GLOBAL watermark-present rule may still fire (this
    // asset's manifest has no soft-binding watermark) but for a DIFFERENT reason
    // than the plain image having no manifest at all — both should be non-empty
    // findings lists, not identical canned output.
    expect(signed.findings.length).toBeGreaterThan(0);
    expect(plain.findings.length).toBeGreaterThan(0);
  }, 20000);
});
