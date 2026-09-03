import type { KgBrand, KgFigure, KgSong } from "@scenelock/schema";

/**
 * Quick Scan's OWN watchlist — deliberately kept separate from
 * packages/fixtures/src/kg.ts (the "Neon Harbor" demo production's KG).
 * Adding entries here can never change the existing production pipeline's
 * behavior, findings, or test results — it is read only by
 * `runQuickScanText`/`runQuickScanAsset` below, nothing else.
 *
 * Step 0's finding stands: the matching CODE (Levenshtein edit-similarity,
 * n-gram window match — see @scenelock/gate-clearance's match.ts) needs no
 * production to run, but it only catches whatever's actually listed here.
 * This is real watchlist DATA, not a generic brand/lyrics detection model.
 *
 * A note on the song entry: I (the agent building this) will not author
 * real copyrighted song lyrics into a source file, even for legitimate
 * testing — that's a hard constraint on me, not a technical limitation of
 * the system. "Twinkle, Twinkle, Little Star" is used instead: genuinely
 * real, extremely well-known, and in the public domain (the melody is
 * 1761, Jane Taylor's lyrics are 1806 — the copyright term expired long
 * ago), so reproducing it here doesn't touch anyone's copyright. This
 * satisfies "a real, well-known song" without the reproduction concern a
 * still-copyrighted song would raise for me specifically.
 */

export const QUICKSCAN_BRANDS: KgBrand[] = [
  {
    node_id: "qs_brand_nike",
    kind: "brand",
    name: "Nike",
    aliases: [],
    owner: "Nike, Inc.",
    label_strings: ["NIKE"],
    trademark_classes: ["25", "28"],
    citations: ["uspto:tm/nike-swoosh"],
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

export const QUICKSCAN_SONGS: KgSong[] = [
  {
    node_id: "qs_song_twinkle",
    kind: "song",
    name: "Twinkle, Twinkle, Little Star",
    aliases: [],
    rights_holder: "public domain",
    reference_lyrics: ["twinkle twinkle little star how i wonder what you are"],
    citations: ["public-domain:jane-taylor-1806"],
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * Deliberately empty: real-person name-matching is wired and tested (see
 * index.test.ts), but no real living/deceased individual's name is seeded
 * here without a stronger reason than "prove the mechanism works" — that's
 * a data-population decision for later, not a limitation of the check
 * itself. The consent-verification half of real_person is `not_applicable`
 * regardless (see index.ts) since Quick Scan has no consent registry.
 */
export const QUICKSCAN_FIGURES: KgFigure[] = [];
