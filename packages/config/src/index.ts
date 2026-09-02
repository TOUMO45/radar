/**
 * @scenelock/config — the one place for cross-cutting defaults (spec D6).
 */

/** "Control Room" design tokens (spec C.4, D13). Mirrored in the console CSS. */
export const CONTROL_ROOM_TOKENS = {
  bg: { base: "#0B0E14", panel: "#11151D", raise: "#171C26" },
  line: { hair: "#232A36" },
  text: { primary: "#E6EAF2", secondary: "#8B94A7" },
  status: {
    locked: "#2BD576",
    held: "#FFB224",
    certified: "#6E8BFF",
    error: "#F4586B",
    info: "#8B94A7",
  },
  source: { deterministic: "#22CCEE", model: "#A78BFA", hybrid: "#2DD4BF" },
  radius: { panel: 6, badge: 2 },
  font: {
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "Cascadia Code", monospace',
  },
} as const;

/** Per-production defaults (spec §6, §7, E.12). */
export const PRODUCTION_DEFAULTS = {
  /** confidence threshold τ */
  tau: 0.7,
  /** auto-regens per finding */
  loop_budget: 2,
  cost_caps: {
    veo_seconds_cap: 900,
    gemini_token_cap: 4_000_000,
    loop_attempts_cap: 24,
    usd_cap: 250,
  },
} as const;

/**
 * Degraded-mode τ bump (spec E.9): when the Archivist is down, gates run
 * reference-image-only and τ is raised so one hallucination can't freeze a scene.
 */
export const DEGRADED_TAU_BUMP = 0.1;

/** Provider cost map — USD. Metered from provider metadata + META logs (E.12). */
export const COST_MAP = {
  /** Veo generation, per output second */
  veo_usd_per_second: 0.35,
  /** Gemini, per 1k tokens (blended in/out for the demo) */
  gemini_usd_per_1k_tokens: 0.0025,
} as const;

export function attemptUsd(veoSeconds: number, geminiTokens: number): number {
  return (
    veoSeconds * COST_MAP.veo_usd_per_second +
    (geminiTokens / 1000) * COST_MAP.gemini_usd_per_1k_tokens
  );
}
