import { z } from "zod";
import { Timestamp } from "./primitives.js";

/**
 * Clearance Knowledge Graph (spec §11, E.7 `kg/{kind}/{nodeId}`).
 * Grounded reference corpus the clearance gate matches against. Curated by the
 * researcher; every node carries citations (grounding, E.8).
 */
export const KgKind = z.enum(["brand", "song", "figure", "location"]);
export type KgKind = z.infer<typeof KgKind>;

const KgBase = {
  node_id: z.string().min(1),
  kind: KgKind,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  citations: z.array(z.string()).default([]),
  updated_at: Timestamp,
};

export const KgBrand = z
  .object({
    ...KgBase,
    kind: z.literal("brand"),
    owner: z.string().default(""),
    /** normalized label strings that appear on the product (for OCR edit-distance). */
    label_strings: z.array(z.string()).default([]),
    trademark_classes: z.array(z.string()).default([]),
  })
  .strict();
export type KgBrand = z.infer<typeof KgBrand>;

export const KgSong = z
  .object({
    ...KgBase,
    kind: z.literal("song"),
    rights_holder: z.string().default(""),
    /** reference lyric lines, normalized, for 8-gram window matching (E.5.2). */
    reference_lyrics: z.array(z.string()).default([]),
  })
  .strict();
export type KgSong = z.infer<typeof KgSong>;

export const KgFigure = z
  .object({
    ...KgBase,
    kind: z.literal("figure"),
    /** e.g. "us_senator", "ceo", "athlete" — public-figure index (E.5.2 real_person). */
    role: z.string().default(""),
    living: z.boolean().default(true),
  })
  .strict();
export type KgFigure = z.infer<typeof KgFigure>;

export const KgLocation = z
  .object({ ...KgBase, kind: z.literal("location"), jurisdiction: z.string().default("") })
  .strict();
export type KgLocation = z.infer<typeof KgLocation>;

export const KgNode = z.discriminatedUnion("kind", [KgBrand, KgSong, KgFigure, KgLocation]);
export type KgNode = z.infer<typeof KgNode>;
