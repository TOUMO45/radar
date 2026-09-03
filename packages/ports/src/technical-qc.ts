/**
 * TechnicalQcPort — the seam to an automated technical-delivery QC engine
 * (loudness, captions/subtitles, frame rate, resolution, colour space,
 * codec conformance) against a broadcast / IMF / DCP spec.
 *
 * RADAR performs this check itself today via `@scenelock/gate-delivery` over a
 * `TechnicalMaster` (StoragePort.getTechnicalMaster). This interface is the
 * defined integration point for a dedicated vendor engine — e.g. Interra
 * Systems BATON — to drop in behind, with a partner endpoint + credentials,
 * without changing any caller (spec principle: seams). Not yet implemented
 * against a live vendor.
 */

export interface TechnicalQcCheckInput {
  scene_id: string;
  /** filesystem path or URI to the assembled master to QC (null → spec-only). */
  master_ref?: string | null;
  /** the delivery spec id to check against, e.g. "imf_app2e", "atsc_a85". */
  spec_id: string;
}

export interface TechnicalQcResult {
  scene_id: string;
  spec_id: string;
  passed: boolean;
  /** human-readable conformance violations, empty when `passed`. */
  violations: string[];
  /** stable id of the engine that produced this result. */
  detector: string;
}

export interface TechnicalQcPort {
  check(input: TechnicalQcCheckInput): Promise<TechnicalQcResult>;
  /** a stable id for the adapter, surfaced in the result's `detector` field. */
  readonly id: string;
}
