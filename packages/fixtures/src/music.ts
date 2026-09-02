import type { MusicCue } from "@scenelock/schema";

/**
 * DRY_RUN music-cue seed (R6). Scene sc_12's music: a *featured* hummed bridge in
 * the "Gimme Shelter" style that is UNLICENSED (this is the same cue the lyric
 * sub-gate already flags), a cleared production-music bed, and a public-domain
 * theme. The cue sheet + rights gate turn the unlicensed cue into a finding and
 * carry the whole sheet into the certificate appendix.
 */
export const musicCues: Record<string, MusicCue[]> = {
  sc_12: [
    {
      cue_id: "cue_shelter",
      scene_id: "sc_12",
      title: "Shelter From the Storm (hummed bridge)",
      writers: ["Jagger/Richards (ref)"],
      publisher: "ABKCO (ref)",
      performer: "synthetic vocal",
      use: "featured",
      duration_ms: 18000,
      timecode_in: "00:00:41:00",
      license_status: "unlicensed",
      license_type: "none",
      license_ref: null,
      source: "generated audio (Veo)",
    },
    {
      cue_id: "cue_neon_bed",
      scene_id: "sc_12",
      title: "Neon Harbor Drift",
      writers: ["Radar Music Library"],
      publisher: "Radar Production Music",
      performer: null,
      use: "background",
      duration_ms: 52000,
      timecode_in: "00:00:00:00",
      license_status: "production_music",
      license_type: "blanket",
      license_ref: "pml_radar_blanket_2026",
      source: "production music library",
    },
    {
      cue_id: "cue_harbor_theme",
      scene_id: "sc_12",
      title: "Harbor Lights (trad.)",
      writers: ["Traditional"],
      publisher: null,
      performer: "synthetic ensemble",
      use: "theme",
      duration_ms: 12000,
      timecode_in: "00:00:59:00",
      license_status: "public_domain",
      license_type: "none",
      license_ref: null,
      source: "generated audio (Veo)",
    },
  ],
};
