/**
 * MusicIdPort — the seam to an audio content-identification service that
 * fingerprints a scene's audio bed and returns the musical works it contains,
 * so the cue sheet and the music-rights gate can be built from what is
 * *actually* in the mix rather than only what production declared.
 *
 * RADAR builds the cue sheet today from declared `MusicCue`s
 * (StoragePort.listMusicCues) via `@scenelock/gate-music`. This interface is
 * the defined integration point for a fingerprinting vendor — e.g. Audible
 * Magic — to drop in behind, with a partner API key, without changing any
 * caller. Not yet implemented against a live vendor.
 */

export interface MusicIdInput {
  scene_id: string;
  /** filesystem path or URI to the audio asset to identify (null → declared-only). */
  audio_ref?: string | null;
}

export interface MusicIdMatch {
  title: string;
  artist: string | null;
  rights_holder: string | null;
  /** 0..1 fingerprint match confidence. */
  confidence: number;
  /** where in the scene the match starts/ends, seconds. */
  start_s: number;
  end_s: number;
}

export interface MusicIdResult {
  scene_id: string;
  matches: MusicIdMatch[];
  detector: string;
}

export interface MusicIdPort {
  identify(input: MusicIdInput): Promise<MusicIdResult>;
  /** a stable id for the adapter, surfaced in the result's `detector` field. */
  readonly id: string;
}
