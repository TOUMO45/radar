import { IPTC_AI_SOURCE_TYPES, type C2paValidation } from "@scenelock/schema";

/**
 * Deterministic parser for a ContentAuth `c2patool` report (roadmap R2).
 *
 * `c2patool <asset>` prints a JSON manifest-store report, or exits non-zero with
 * "No claim found" when the asset carries no Content Credential. This module maps
 * that raw output to Radar's `C2paValidation` — model-free, fully testable
 * against real tool output (see parse.test.ts, fed captured `c2patool` JSON).
 */

export interface C2patoolOutcome {
  /** true when the tool found and reported a manifest (exit 0). */
  ok: boolean;
  /** parsed JSON report when ok. */
  report?: unknown;
  /** the tool's error text when not ok (e.g. "No claim found"). */
  error?: string;
}

/**
 * C2PA validation status codes.
 *   - TRUST codes concern *who* signed (cert not anchored / expired / revoked).
 *   - INTEGRITY codes concern *tamper* (a hash or the claim signature mismatches).
 * A manifest can be integrity-valid yet untrusted (a self- or test-signed asset).
 */
const isTrustFailure = (code: string): boolean =>
  /^signingCredential\.|^timeStamp\.|untrusted|revoked|expired|notTrusted/i.test(code);

const isIntegrityFailure = (code: string): boolean =>
  !isTrustFailure(code) &&
  /mismatch|malformed|missing|\.invalid$|\.invalid\b|notValid|hashedURI\.(?!match)/i.test(code);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Collect validation status codes from the top level and every manifest. */
function collectCodes(report: Record<string, unknown>): string[] {
  const codes: string[] = [];
  const pull = (vs: unknown) => {
    if (Array.isArray(vs)) for (const e of vs) {
      const c = asRecord(e).code;
      if (typeof c === "string") codes.push(c);
    }
  };
  pull(report.validation_status);
  const manifests = asRecord(report.manifests);
  for (const m of Object.values(manifests)) pull(asRecord(m).validation_status);
  return codes;
}

function activeManifest(report: Record<string, unknown>): Record<string, unknown> {
  const manifests = asRecord(report.manifests);
  const activeId = report.active_manifest;
  if (typeof activeId === "string" && manifests[activeId]) return asRecord(manifests[activeId]);
  const first = Object.values(manifests)[0];
  return asRecord(first);
}

/** Scan the actions assertions for an AI digitalSourceType. */
function aiSignal(active: Record<string, unknown>): { ai: boolean; source: string | null } {
  const assertions = Array.isArray(active.assertions) ? active.assertions : [];
  const aiSet = new Set<string>(IPTC_AI_SOURCE_TYPES);
  for (const a of assertions) {
    const rec = asRecord(a);
    const label = typeof rec.label === "string" ? rec.label : "";
    if (!label.startsWith("c2pa.actions")) continue;
    const actions = Array.isArray(asRecord(rec.data).actions) ? (asRecord(rec.data).actions as unknown[]) : [];
    for (const act of actions) {
      const dst = asRecord(act).digitalSourceType;
      if (typeof dst === "string" && aiSet.has(dst)) return { ai: true, source: dst };
    }
  }
  return { ai: false, source: null };
}

function hasSoftBinding(active: Record<string, unknown>): boolean {
  const assertions = Array.isArray(active.assertions) ? active.assertions : [];
  return assertions.some((a) => {
    const label = asRecord(a).label;
    return typeof label === "string" && label.startsWith("c2pa.soft_binding");
  });
}

/** Map a c2patool outcome to Radar's deterministic C2PA validation result. */
export function parseC2paReport(outcome: C2patoolOutcome): C2paValidation {
  if (!outcome.ok || !outcome.report) {
    // "No claim found" (or any read failure) → the asset carries no manifest.
    return {
      present: false,
      integrity_ok: false,
      trusted: false,
      verified: false,
      signer: null,
      signature_alg: null,
      signed_at: null,
      claim_generator: null,
      ai_generated_signal: false,
      ai_source_type: null,
      soft_binding_watermark: false,
      validation_codes: [],
    };
  }

  const report = asRecord(outcome.report);
  const active = activeManifest(report);
  const codes = collectCodes(report);
  const integrity_ok = !codes.some(isIntegrityFailure);
  const trusted = codes.length > 0 ? !codes.some(isTrustFailure) : true;
  const sig = asRecord(active.signature_info);
  const { ai, source } = aiSignal(active);

  return {
    present: true,
    integrity_ok,
    trusted,
    verified: integrity_ok, // present && integrity_ok
    signer:
      (typeof sig.issuer === "string" && sig.issuer) ||
      (typeof sig.common_name === "string" && sig.common_name) ||
      null,
    signature_alg: typeof sig.alg === "string" ? sig.alg : null,
    signed_at: typeof sig.time === "string" ? sig.time : null,
    claim_generator: typeof active.claim_generator === "string" ? active.claim_generator : null,
    ai_generated_signal: ai,
    ai_source_type: source,
    soft_binding_watermark: hasSoftBinding(active),
    validation_codes: codes,
  };
}
