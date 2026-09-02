import type { TechnicalMaster } from "@scenelock/schema";

/**
 * DRY_RUN technical-master seed (R4). The assembled master for scene sc_12 as a
 * Veo-generated pipeline typically first emits it: HD, 8-bit h264, no captions,
 * loudness hot at -30 LKFS — i.e. NOT yet delivery-ready for SVOD/broadcast. The
 * delivery gate turns those into cited findings.
 */
export const technicalMaster: Record<string, TechnicalMaster> = {
  sc_12: {
    scene_id: "sc_12",
    width: 1920,
    height: 1080,
    fps: 24,
    color_space: "rec709",
    bit_depth: 8,
    codec: "h264",
    container: "mp4",
    loudness_lkfs: -30,
    true_peak_dbtp: -0.5,
    has_captions: false,
    caption_format: null,
    hdr: false,
  },
};
