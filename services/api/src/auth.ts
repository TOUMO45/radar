import type { Role } from "@scenelock/schema";

/**
 * Minimal DRY_RUN identity layer (fixes VULN-1, audit 2026-09-03).
 *
 * BEFORE: every producer/legal/sre_admin-gated route trusted a raw
 * `x-scenelock-role` request header with nothing authenticating it — any
 * client could set that header and pass every role check (sign a
 * certificate, engage/disengage the kill-switch, waive a blocking HIGH
 * finding, edit the compliance profile, run SceneBench, read the admin
 * audit log).
 *
 * AFTER: an elevated role must be proven by presenting a possession-based
 * bearer token (`Authorization: Bearer <token>`), mirroring the pattern the
 * MCP server already uses for its own token auth (services/mcp/src/auth.ts).
 * `x-scenelock-role` is no longer authoritative for anything — a caller
 * with no valid token, or an invalid one, is always treated as the lowest
 * privilege (`qa_reviewer`), regardless of what any header claims.
 *
 * These are DEV/DEMO secrets — same spirit as the already-committed
 * `DEMO_MCP_TOKEN` in packages/fixtures/src/tokens.ts. Override every
 * RADAR_ROLE_TOKEN_* env var before exposing this instance beyond local
 * development; a production deployment should replace this whole module
 * with real session/JWT verification.
 */

export interface RestPrincipal {
  role: Role;
  by: string;
}

const ROLE_TOKENS: Partial<Record<Role, string>> = {
  producer: process.env.RADAR_ROLE_TOKEN_PRODUCER ?? "radar_dev_producer_9f2a7c1e",
  legal: process.env.RADAR_ROLE_TOKEN_LEGAL ?? "radar_dev_legal_6c31b8d4",
  sre_admin: process.env.RADAR_ROLE_TOKEN_SRE_ADMIN ?? "radar_dev_sre_admin_e07d5f2a",
};

const TOKEN_TO_ROLE: Record<string, Role> = Object.fromEntries(
  Object.entries(ROLE_TOKENS).filter((e): e is [Role, string] => !!e[1]).map(([role, tok]) => [tok, role as Role]),
);

/** Exported so the BFF (apps/console) can map its dev role-picker to the same tokens. */
export const DEV_ROLE_TOKENS: Readonly<Partial<Record<Role, string>>> = ROLE_TOKENS;

type HeaderBag = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/**
 * Derive the caller's role from a bearer token, never from a raw header
 * claim. Falls back to `qa_reviewer` (read-mostly, lowest privilege) whenever
 * no valid token is presented — this is the fix: a header alone can no
 * longer grant authority.
 */
export function resolveIdentity(headers: HeaderBag): RestPrincipal {
  const authz = first(headers["authorization"]).trim();
  const by = first(headers["x-scenelock-user"]) || "anonymous";
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (m) {
    const role = TOKEN_TO_ROLE[m[1]!.trim()];
    if (role) return { role, by };
  }
  return { role: "qa_reviewer", by };
}

/**
 * Same identity model as `resolveIdentity`, but distinguishes "no credential
 * presented at all" (401) from "a credential was presented but doesn't carry
 * an allowed role" (403) — for routes gating genuinely sensitive data
 * (subject names, consent documents) where that distinction is worth making
 * explicit, rather than folding both into 403 the way the earlier
 * producer/legal/sre_admin write-route checks do.
 */
export function requireRole(
  headers: HeaderBag,
  allowed: readonly Role[],
): { ok: true; role: Role; by: string } | { ok: false; code: 401 | 403; error: string } {
  const authz = first(headers["authorization"]).trim();
  if (!authz) return { ok: false, code: 401, error: "authentication required" };
  const { role, by } = resolveIdentity(headers);
  if (!allowed.includes(role))
    return { ok: false, code: 403, error: `requires one of: ${allowed.join(", ")}` };
  return { ok: true, role, by };
}
