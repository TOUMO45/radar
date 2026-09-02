import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseC2paReport } from "./parse.js";

/**
 * Pure parser tests — fed REAL captured `c2patool` output (test-fixtures/
 * signed-ai.c2patool.json, produced by running ContentAuth c2patool v0.27.16
 * over a genuine C2PA-signed test image). No binary needed at test time.
 */
const realReport = JSON.parse(
  readFileSync(fileURLToPath(new URL("../test-fixtures/signed-ai.c2patool.json", import.meta.url)), "utf8"),
);

describe("parseC2paReport — real c2patool output", () => {
  it("a genuine signed AI asset: intact but test-CA untrusted, AI signal detected", () => {
    const v = parseC2paReport({ ok: true, report: realReport });
    expect(v.present).toBe(true);
    expect(v.integrity_ok).toBe(true); // hashes/claim verify — no tamper
    expect(v.trusted).toBe(false); // C2PA Test Signing Cert is not a trusted anchor
    expect(v.verified).toBe(true); // present && integrity_ok (EU 50(2) machine-readable mark)
    expect(v.validation_codes).toContain("signingCredential.untrusted");
    expect(v.ai_generated_signal).toBe(true);
    expect(v.ai_source_type).toContain("algorithmicMedia");
    expect(v.signer).toBeTruthy();
    expect(v.signature_alg).toBeTruthy();
  });

  it("no manifest → not present, not verified", () => {
    const v = parseC2paReport({ ok: false, error: "No claim found" });
    expect(v.present).toBe(false);
    expect(v.verified).toBe(false);
    expect(v.ai_generated_signal).toBe(false);
  });

  it("a tampered asset (dataHash.mismatch) → present but integrity fails, not verified", () => {
    const tampered = {
      active_manifest: "m1",
      manifests: { m1: { signature_info: { issuer: "Real CA" }, assertions: [] } },
      validation_status: [{ code: "assertion.dataHash.mismatch" }],
    };
    const v = parseC2paReport({ ok: true, report: tampered });
    expect(v.present).toBe(true);
    expect(v.integrity_ok).toBe(false);
    expect(v.verified).toBe(false);
  });

  it("a fully trusted, intact asset (no failure codes) → verified and trusted", () => {
    const clean = {
      active_manifest: "m1",
      manifests: {
        m1: {
          claim_generator: "Adobe/1.0",
          signature_info: { issuer: "Trusted CA", alg: "Es256", time: "2026-01-01T00:00:00Z" },
          assertions: [
            { label: "c2pa.soft_binding", data: {} },
            { label: "c2pa.actions.v2", data: { actions: [{ action: "c2pa.created", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }] } },
          ],
        },
      },
      validation_status: [],
    };
    const v = parseC2paReport({ ok: true, report: clean });
    expect(v.verified).toBe(true);
    expect(v.trusted).toBe(true);
    expect(v.soft_binding_watermark).toBe(true);
    expect(v.ai_generated_signal).toBe(true);
  });
});
