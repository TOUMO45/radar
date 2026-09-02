/**
 * Deterministic string-match primitives for the clearance gate cores.
 * Kept tiny and dependency-free; every threshold has a SceneBench fixture (P6).
 */

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}

/** 0..1 similarity from normalized edit distance. */
export function editSimilarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(x, y) / maxLen;
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

export function ngrams(toks: string[], n: number): string[] {
  if (toks.length < n) return toks.length ? [toks.join(" ")] : [];
  const out: string[] = [];
  for (let i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(" "));
  return out;
}

/**
 * Best n-gram window overlap of `reference` against `text` (E.5.2 lyric windows).
 * Handles split-line evasion by sliding windows; returns 0..1.
 */
export function windowMatch(text: string, reference: string, n = 8): number {
  const refToks = tokens(reference);
  const nn = Math.min(n, Math.max(1, refToks.length));
  const refGrams = new Set(ngrams(refToks, nn));
  if (refGrams.size === 0) return 0;
  const textGrams = new Set(ngrams(tokens(text), nn));
  let hit = 0;
  for (const g of refGrams) if (textGrams.has(g)) hit++;
  // partial credit: also score the best token-overlap ratio so near-misses register
  const refSet = new Set(refToks);
  const textSet = new Set(tokens(text));
  let common = 0;
  for (const t of refSet) if (textSet.has(t)) common++;
  const tokenRatio = refSet.size ? common / refSet.size : 0;
  // exact window hits dominate; loose token overlap is partial credit only
  return Math.max(hit / refGrams.size, tokenRatio);
}

/** Does `needle` (a name/alias) appear as a whole-word phrase in `haystack`? */
export function phrasePresent(haystack: string, needle: string): boolean {
  const h = ` ${normalize(haystack)} `;
  const nd = normalize(needle);
  return nd.length > 0 && h.includes(` ${nd} `);
}
