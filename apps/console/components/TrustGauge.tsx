"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TrustGauge — a 0–100 arc ring for the Trust Score (compliance vertical).
 * Band colour, count-up on mount, arc sweeps to value. Reused on the
 * Productions home, Production Overview and the Compliance screen.
 */

const BAND: Record<string, { color: string; label: string }> = {
  green: { color: "var(--color-status-locked)", label: "green" },
  amber: { color: "var(--color-status-held)", label: "amber" },
  red: { color: "var(--color-status-error)", label: "red" },
};

function bandFor(score: number, given?: string): string {
  if (given && BAND[given]) return given;
  return score >= 85 ? "green" : score >= 60 ? "amber" : "red";
}

export function TrustGauge({
  score,
  band,
  headline,
  size = 132,
  label = "trust score",
}: {
  score: number;
  band?: string;
  headline?: string;
  size?: number;
  label?: string;
}) {
  const b = BAND[bandFor(score, band)];
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  // 270° arc (gap at the bottom)
  const arc = 0.75;
  const circ = 2 * Math.PI * r;
  const dash = circ * arc;

  const [shown, setShown] = useState(0);
  const raf = useRef<number>(0);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setShown(score);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(eased * score));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [score, reduced]);

  const progress = Math.max(0, Math.min(1, shown / 100));

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size * 0.86 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
          <g transform={`rotate(135 ${cx} ${cx})`}>
            <circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke="var(--color-line-hair)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
            />
            <circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={b.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash * progress} ${circ}`}
              style={{
                transition: reduced ? "none" : "stroke-dasharray 0.15s linear",
                filter: `drop-shadow(0 0 6px ${b.color})`,
              }}
            />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: size * 0.06 }}>
          <span className="mono font-medium leading-none" style={{ fontSize: size * 0.32, color: b.color }}>
            {shown}
          </span>
          <span className="h-eyebrow mt-1" style={{ color: b.color }}>
            {b.label}
          </span>
        </div>
      </div>
      <span className="h-eyebrow mt-1">{label}</span>
      {headline && (
        <span className="text-[11px] text-[var(--color-text-secondary)] text-center mt-1 leading-snug max-w-[180px]">
          {headline}
        </span>
      )}
    </div>
  );
}
