/**
 * Deterministic placeholder "frame" for the Evidence Canvas. DRY_RUN has no real
 * media, so we render a labelled synthetic frame seeded by shot + frame number,
 * with an optional entity bbox. The real canvas (C-09) lazy-loads signed URLs.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function EvidenceFrame({
  label,
  seed,
  frame,
  bbox,
  overlay = false,
}: {
  label: string;
  seed: string;
  frame?: number | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  overlay?: boolean;
}) {
  const h = hash(seed + ":" + (frame ?? 0));
  const hue = h % 360;
  const bars = Array.from({ length: 7 }, (_, i) => ({
    x: (i * 640) / 7 + ((h >> (i * 3)) % 12),
    w: 640 / 7 - 10,
    o: 0.06 + (((h >> (i * 2)) % 10) / 10) * 0.10,
  }));

  return (
    <svg viewBox="0 0 640 360" className="w-full h-auto block" role="img" aria-label={`${label} — synthetic evidence frame`}>
      <rect width="640" height="360" fill={`hsl(${hue} 30% 10%)`} />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={360} fill={`hsl(${(hue + 40) % 360} 40% 55%)`} opacity={b.o} />
      ))}
      <rect x="0" y="0" width="640" height="360" fill="none" stroke="var(--color-line-hair)" />
      {bbox && (
        <g>
          <rect
            x={bbox.x}
            y={bbox.y}
            width={bbox.w}
            height={bbox.h}
            fill={overlay ? "var(--color-status-error)" : "none"}
            fillOpacity={overlay ? 0.18 : 0}
            stroke="var(--color-status-error)"
            strokeWidth={2}
            strokeDasharray={overlay ? "4 3" : "0"}
          />
        </g>
      )}
      <text x="12" y="24" fill="var(--color-text-secondary)" fontSize="13" fontFamily="var(--font-mono)">
        {label}
      </text>
      {frame != null && (
        <text x="628" y="346" textAnchor="end" fill="var(--color-text-secondary)" fontSize="12" fontFamily="var(--font-mono)">
          frame {frame}
        </text>
      )}
    </svg>
  );
}
