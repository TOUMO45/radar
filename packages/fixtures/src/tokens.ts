import type { ApiToken } from "@scenelock/schema";
import { ORG_ID } from "./dry-run.js";

/**
 * DRY_RUN MCP token (spec E.6). Plaintext is a fixed demo constant; only its
 * sha-256 is stored (E.7). Use it as `Authorization: Bearer <plaintext>` against
 * services/mcp. Real tokens are shown once at creation and never again.
 */
export const DEMO_MCP_TOKEN = "radar_demo_neonharbor_ro";
const DEMO_MCP_TOKEN_SHA256 =
  "392026545db1235b4b7104814f0badd6b4a2650b675077ff808dcbcbf04e5174";

export const apiTokens: ApiToken[] = [
  {
    token_id: "tok_demo_ro",
    org_id: ORG_ID,
    name: "Demo pipeline (read + propose)",
    hash: DEMO_MCP_TOKEN_SHA256,
    prefix: "radar_demo_",
    scopes: ["findings:read", "world_state:read", "world_state:propose", "certificates:read"],
    created_by: "u_producer",
    created_at: "2026-08-25T00:00:00.000Z",
    last_used_at: null,
    revoked: false,
  },
];
