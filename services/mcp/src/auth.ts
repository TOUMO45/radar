import { createHash } from "node:crypto";
import type { StoragePort } from "@scenelock/ports";
import type { McpScope } from "@scenelock/schema";

/** Authenticated caller derived from a per-org bearer token (E.6). */
export interface Principal {
  org_id: string;
  token_id: string;
  prefix: string;
  scopes: McpScope[];
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** `Authorization: Bearer <token>` → Principal, or null. Never leaks the token. */
export async function authenticate(
  storage: StoragePort,
  authorization: string | undefined,
): Promise<Principal | null> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return null;
  const tok = await storage.getApiTokenByHash(sha256(m[1]!.trim()));
  if (!tok || tok.revoked) return null;
  await storage.putApiToken({ ...tok, last_used_at: new Date().toISOString() });
  return { org_id: tok.org_id, token_id: tok.token_id, prefix: tok.prefix, scopes: tok.scopes };
}

export function hasScope(p: Principal, scope: McpScope): boolean {
  return p.scopes.includes(scope);
}
