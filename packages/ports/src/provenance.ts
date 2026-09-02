import type { ProvenanceVerification, ShotProvenance } from "@scenelock/schema";

/**
 * ProvenancePort (roadmap R2) — the seam that turns *declared* provenance into
 * *verified* provenance. The DRY_RUN adapter derives the result from the shot's
 * declared `ShotProvenance`; the live adapter (`services/provenance`) runs a real
 * C2PA verifier (ContentAuth `c2patool`) over the asset bytes, and a SynthID /
 * watermark detector where GCP is available.
 *
 * Services depend only on this interface — the local and cloud implementations
 * are swapped by construction, never by editing callers (spec principle: seams).
 */
export interface ProvenanceVerifyInput {
  shot_id: string;
  /** filesystem path or URI to the asset bytes to verify (null → declared-only). */
  asset_ref?: string | null;
  /** the shot's declared provenance, used by the DRY_RUN adapter as its source. */
  declared?: ShotProvenance | null;
}

export interface ProvenancePort {
  /** Verify one shot's provenance, returning the cryptographic result. */
  verify(input: ProvenanceVerifyInput): Promise<ProvenanceVerification>;
  /** a stable id for the adapter, surfaced in the result's `detector` field. */
  readonly id: string;
}
