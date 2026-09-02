import { z } from "zod";
import { Timestamp } from "./primitives.js";

/**
 * MCP surface security (spec E.6, E.7 `orgs/{orgId}/api_tokens`, `audit_log`).
 * Per-org bearer tokens, hashed at rest, prefix shown in the UI; every call is
 * scope-checked and written to the append-only audit log.
 */
export const McpScope = z.enum([
  "findings:read",
  "world_state:read",
  "world_state:propose",
  "adjudicate:write",
  "certificates:read",
]);
export type McpScope = z.infer<typeof McpScope>;

export const ApiToken = z
  .object({
    token_id: z.string().min(1),
    org_id: z.string().min(1),
    name: z.string().min(1),
    /** sha-256 hex of the plaintext token; the plaintext is shown once at creation. */
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    prefix: z.string().min(1), // first chars, for UI identification
    scopes: z.array(McpScope).default([]),
    created_by: z.string().min(1),
    created_at: Timestamp,
    last_used_at: Timestamp.nullable().default(null),
    revoked: z.boolean().default(false),
  })
  .strict();
export type ApiToken = z.infer<typeof ApiToken>;

export const AuditEntry = z
  .object({
    entry_id: z.string().min(1),
    org_id: z.string().min(1),
    at: Timestamp,
    principal: z.string().min(1), // token prefix or user id
    action: z.string().min(1), // e.g. "mcp.check_scene", "adjudication.waive"
    params_hash: z.string().nullable().default(null),
    meta: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type AuditEntry = z.infer<typeof AuditEntry>;
