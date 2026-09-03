/**
 * Public embeddable "AI-Disclosed & Cleared" badge (Feature 2).
 *
 * Hand-built SVG string, zero dependencies. Exposes strictly less than
 * /verify/:slug — only a colour and a short label, no hashes, ids or flags —
 * so it is safe to serve unauthenticated under the same trust model.
 *
 *   status "valid"  → green  "✓ AI-Disclosed & Cleared"
 *   anything else    → red    "✗ Not Certified"
 */

const GREEN = "#2ea44f";
const RED = "#d1242f";
const LABEL_BG = "#24292f";

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** rough advance width per character at 11px DejaVu-ish — good enough for a badge. */
function textWidth(s: string): number {
  return Math.ceil(s.length * 6.6);
}

export function renderBadgeSvg(status: string): string {
  const cleared = status === "valid";
  const label = "RADAR";
  const message = cleared ? "✓ AI-Disclosed & Cleared" : "✗ Not Certified";
  const msgBg = cleared ? GREEN : RED;

  const padX = 8;
  const labelW = textWidth(label) + padX * 2;
  const msgW = textWidth(message) + padX * 2;
  const w = labelW + msgW;
  const h = 20;
  const labelMid = labelW / 2;
  const msgMid = labelW + msgW / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(message)}">`,
    `<title>${esc(label)}: ${esc(message)}</title>`,
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `<clipPath id="r"><rect width="${w}" height="${h}" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${labelW}" height="${h}" fill="${LABEL_BG}"/>`,
    `<rect x="${labelW}" width="${msgW}" height="${h}" fill="${msgBg}"/>`,
    `<rect width="${w}" height="${h}" fill="url(#s)"/>`,
    `</g>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    `<text x="${labelMid}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text>`,
    `<text x="${labelMid}" y="14">${esc(label)}</text>`,
    `<text x="${msgMid}" y="15" fill="#010101" fill-opacity=".3">${esc(message)}</text>`,
    `<text x="${msgMid}" y="14">${esc(message)}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
