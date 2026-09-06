import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one page header, used on every screen so the console reads as a single
 * app. Eyebrow + oversized title over a thin gradient rule that wipes in once
 * on load — that rule is the deliberate motion moment; everything else on the
 * header is still.
 *
 * `tone` maps a status word to the signal palette so the header chip means the
 * same thing everywhere (green = clean/locked, amber = held, red = blocking,
 * blue = signed, cyan = neutral accent).
 */
type Tone = "locked" | "held" | "error" | "certified" | "accent" | "model" | "muted";

const TONE_VAR: Record<Tone, string> = {
  locked: "var(--color-status-locked)",
  held: "var(--color-status-held)",
  error: "var(--color-status-error)",
  certified: "var(--color-status-certified)",
  accent: "var(--color-accent)",
  model: "var(--color-source-model)",
  muted: "var(--color-text-secondary)",
};

export function PageHeader({
  eyebrow,
  title,
  sub,
  backHref,
  backLabel,
  status,
  statusTone = "accent",
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  status?: string;
  statusTone?: Tone;
  children?: ReactNode;
}) {
  return (
    <header className="page-head rise">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mono text-[11px] text-[var(--color-accent)] hover:underline inline-flex items-center gap-1"
          >
            <span aria-hidden>←</span>
            {backLabel ?? "back"}
          </Link>
        )}
        {eyebrow && <div className="h-eyebrow mt-1">{eyebrow}</div>}
        <div className="flex items-center gap-3 flex-wrap mt-[2px]">
          <h1 className="page-title">{title}</h1>
          {status && (
            <span
              className="chip chip-solid"
              style={{ color: TONE_VAR[statusTone] }}
            >
              {status}
            </span>
          )}
        </div>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </header>
  );
}
