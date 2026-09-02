import { z } from "zod";
import { Severity, Timestamp } from "./primitives.js";
import { Platform } from "./compliance.js";

/**
 * Technical delivery QC (Radar 2026 extension, roadmap R4).
 *
 * Beyond *legal* deliverability (compliance) and *rights* (clearance), a real
 * distributor rejects a master that fails **technical** delivery: loudness off
 * the platform's target, no captions, wrong frame rate, resolution or colour
 * space. This is the axis Baton / Vidchecker occupy — Radar does it AI-native,
 * chained into the same finding/verdict schema. All deterministic (S1).
 */

export const ColorSpace = z.enum(["rec709", "rec2020", "dci_p3", "xyz", "srgb"]);
export type ColorSpace = z.infer<typeof ColorSpace>;

/** The observed technical properties of a scene's assembled master. */
export const TechnicalMaster = z
  .object({
    scene_id: z.string().min(1),
    width: z.number().int().min(0),
    height: z.number().int().min(0),
    fps: z.number().min(0),
    color_space: ColorSpace,
    bit_depth: z.number().int().min(0),
    codec: z.string(),
    container: z.string(),
    /** integrated loudness, LKFS/LUFS (null = not measured). */
    loudness_lkfs: z.number().nullable().default(null),
    /** true-peak, dBTP (null = not measured). */
    true_peak_dbtp: z.number().nullable().default(null),
    has_captions: z.boolean().default(false),
    caption_format: z.string().nullable().default(null),
    hdr: z.boolean().default(false),
  })
  .strict();
export type TechnicalMaster = z.infer<typeof TechnicalMaster>;

/** A platform's required technical delivery spec. */
export const DeliverySpec = z
  .object({
    platform: Platform,
    label: z.string(),
    citation: z.string(),
    min_width: z.number().int(),
    min_height: z.number().int(),
    allowed_fps: z.array(z.number()),
    allowed_color_spaces: z.array(ColorSpace),
    min_bit_depth: z.number().int(),
    /** target integrated loudness and tolerance (± LKFS). */
    loudness_lkfs_target: z.number(),
    loudness_tolerance: z.number(),
    /** maximum permitted true-peak, dBTP. */
    max_true_peak_dbtp: z.number(),
    captions_required: z.boolean(),
    allowed_codecs: z.array(z.string()),
  })
  .strict();
export type DeliverySpec = z.infer<typeof DeliverySpec>;

/**
 * Real, cited delivery specs. Values reflect public standards / platform specs:
 *  - broadcast_tv: EBU R128 (-23 LKFS ±1, TP ≤ -1 dBTP), 1080/25p, captions.
 *  - svod: Netflix/IMF-style (UHD-capable, -27 LKFS dialog-gated ±2, TP ≤ -2,
 *    Rec.709/2020, 10-bit, IMSC captions, ProRes/JPEG2000).
 *  - theatrical: DCP (JPEG2000, XYZ, 24fps, 2K/4K).
 *  - youtube: web loudness target -14 LKFS, captions recommended.
 */
export const DELIVERY_SPECS: Partial<Record<Platform, DeliverySpec>> = {
  broadcast_tv: {
    platform: "broadcast_tv",
    label: "Broadcast TV (EBU R128)",
    citation: "EBU R128 / EBU Tech 3344 loudness; HD-SDI delivery",
    min_width: 1920,
    min_height: 1080,
    allowed_fps: [25, 29.97, 50],
    allowed_color_spaces: ["rec709"],
    min_bit_depth: 8,
    loudness_lkfs_target: -23,
    loudness_tolerance: 1,
    max_true_peak_dbtp: -1,
    captions_required: true,
    allowed_codecs: ["prores", "xdcam", "avc-intra"],
  },
  svod: {
    platform: "svod",
    label: "SVOD / IMF (Netflix-style)",
    citation: "IMF (SMPTE ST 2067) + Netflix delivery spec; dialog-gated -27 LKFS",
    min_width: 1920,
    min_height: 1080,
    allowed_fps: [23.976, 24, 25, 29.97],
    allowed_color_spaces: ["rec709", "rec2020"],
    min_bit_depth: 10,
    loudness_lkfs_target: -27,
    loudness_tolerance: 2,
    max_true_peak_dbtp: -2,
    captions_required: true,
    allowed_codecs: ["prores", "jpeg2000"],
  },
  theatrical: {
    platform: "theatrical",
    label: "Theatrical (DCP)",
    citation: "DCI Digital Cinema (SMPTE DCP): JPEG2000, XYZ, 24fps",
    min_width: 2048,
    min_height: 858,
    allowed_fps: [24, 48],
    allowed_color_spaces: ["xyz"],
    min_bit_depth: 12,
    loudness_lkfs_target: -27,
    loudness_tolerance: 6,
    max_true_peak_dbtp: 0,
    captions_required: false,
    allowed_codecs: ["jpeg2000"],
  },
  youtube: {
    platform: "youtube",
    label: "YouTube (web delivery)",
    citation: "YouTube loudness normalization (~-14 LKFS) + caption best practice",
    min_width: 1280,
    min_height: 720,
    allowed_fps: [23.976, 24, 25, 29.97, 30, 50, 60],
    allowed_color_spaces: ["rec709", "srgb"],
    min_bit_depth: 8,
    loudness_lkfs_target: -14,
    loudness_tolerance: 2,
    max_true_peak_dbtp: -1,
    captions_required: false,
    allowed_codecs: ["h264", "vp9", "av1", "prores"],
  },
};

export const DeliveryCheck = z
  .object({
    param: z.string(),
    required: z.string(),
    observed: z.string(),
    ok: z.boolean(),
    severity: Severity,
  })
  .strict();
export type DeliveryCheck = z.infer<typeof DeliveryCheck>;

export const DeliveryTargetReport = z
  .object({
    platform: Platform,
    label: z.string(),
    citation: z.string(),
    passed: z.boolean(),
    checks: z.array(DeliveryCheck),
  })
  .strict();
export type DeliveryTargetReport = z.infer<typeof DeliveryTargetReport>;

export const TechnicalDeliveryReport = z
  .object({
    scene_id: z.string().min(1),
    master: TechnicalMaster.nullable(),
    targets: z.array(DeliveryTargetReport),
    passed: z.boolean(),
    computed_at: Timestamp,
  })
  .strict();
export type TechnicalDeliveryReport = z.infer<typeof TechnicalDeliveryReport>;
