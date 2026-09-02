import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  ProvenancePort,
  ProvenanceVerifyInput,
} from "@scenelock/ports";
import type {
  C2paValidation,
  ProvenanceVerification,
  ShotProvenance,
  WatermarkDetection,
  WatermarkMethod,
} from "@scenelock/schema";
import { parseC2paReport, type C2patoolOutcome } from "./parse.js";

export * from "./parse.js";

const pExecFile = promisify(execFile);

/** Locate the ContentAuth c2patool binary: env override → bundled ./bin → PATH. */
export function resolveC2patoolBin(): string {
  const env = process.env.C2PATOOL_BIN;
  if (env) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const exe = process.platform === "win32" ? "c2patool.exe" : "c2patool";
  // src/ or dist/ → package root → bin/
  for (const rel of ["../bin", "../../bin"]) {
    const p = join(here, rel, exe);
    if (existsSync(p)) return p;
  }
  return exe; // fall back to PATH
}

/** Is a runnable c2patool available? (integration tests skip when not.) */
export function c2patoolAvailable(bin = resolveC2patoolBin()): boolean {
  return bin === "c2patool" || bin === "c2patool.exe" || existsSync(bin);
}

function watermarkFrom(c2pa: C2paValidation): WatermarkDetection {
  if (c2pa.soft_binding_watermark) {
    return {
      checked: true,
      detected: true,
      method: "c2pa_soft",
      detector: "c2pa.soft_binding",
      note: "watermark referenced by a C2PA soft-binding assertion",
    };
  }
  // Pixel-level SynthID detection is a Vertex seam (needs Google's detector).
  return {
    checked: true,
    detected: false,
    method: "none",
    detector: "c2patool",
    note: "no C2PA soft-binding; pixel-level SynthID detection needs the Vertex detector",
  };
}

/**
 * Live C2PA verification via the ContentAuth `c2patool` (roadmap R2). Runs the
 * real verifier over the asset bytes and records the cryptographic result —
 * "claims a manifest" becomes "manifest verified".
 */
export class C2paToolProvenanceAdapter implements ProvenancePort {
  readonly id = "c2patool";
  constructor(private bin = resolveC2patoolBin()) {}

  private async run(assetRef: string): Promise<C2patoolOutcome> {
    try {
      const { stdout } = await pExecFile(this.bin, [assetRef], { maxBuffer: 32 * 1024 * 1024 });
      return { ok: true, report: JSON.parse(stdout) };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      // c2patool exits non-zero for "No claim found" — that's a valid negative,
      // not a tool failure. Surface the message either way.
      const text = (e.stderr || e.message || "").trim();
      if (e.stdout) {
        try {
          return { ok: true, report: JSON.parse(e.stdout) };
        } catch {
          /* not JSON — fall through to the no-manifest outcome */
        }
      }
      return { ok: false, error: text || "c2patool: no claim found" };
    }
  }

  async verify(input: ProvenanceVerifyInput): Promise<ProvenanceVerification> {
    if (!input.asset_ref) throw new Error("C2paToolProvenanceAdapter.verify needs an asset_ref");
    const outcome = await this.run(input.asset_ref);
    const c2pa = parseC2paReport(outcome);
    return {
      shot_id: input.shot_id,
      asset_ref: input.asset_ref,
      c2pa,
      watermark: watermarkFrom(c2pa),
      detector: this.id,
      checked_at: new Date().toISOString(),
    };
  }
}

/**
 * DRY_RUN adapter — derives a verification result from the shot's *declared*
 * `ShotProvenance`, so the whole pipeline runs with no binary and no files. The
 * honest distinction stays intact: a declared value is reported as declared, not
 * as independently verified (integrity/trust follow the declared `c2pa.valid`).
 */
export class DryRunProvenanceAdapter implements ProvenancePort {
  readonly id = "dry-run";
  constructor(private now: () => string = () => new Date().toISOString()) {}

  async verify(input: ProvenanceVerifyInput): Promise<ProvenanceVerification> {
    const d: ShotProvenance | null = input.declared ?? null;
    const present = !!d?.c2pa?.present;
    const valid = !!d?.c2pa?.valid;
    const wmDetected = !!d?.watermark?.present && !!d?.watermark?.detectable;
    const method: WatermarkMethod = d?.watermark?.method ?? "none";
    const c2pa: C2paValidation = {
      present,
      integrity_ok: valid,
      trusted: valid,
      verified: present && valid,
      signer: null,
      signature_alg: null,
      signed_at: null,
      claim_generator: d?.generator ?? null,
      ai_generated_signal: !!d?.is_ai_generated,
      ai_source_type: null,
      soft_binding_watermark: method === "c2pa_soft" && wmDetected,
      validation_codes: [],
    };
    return {
      shot_id: input.shot_id,
      asset_ref: input.asset_ref ?? null,
      c2pa,
      watermark: {
        checked: !!d,
        detected: wmDetected,
        method,
        detector: "declared",
        note: d ? null : "no declared provenance",
      },
      detector: this.id,
      checked_at: this.now(),
    };
  }
}
