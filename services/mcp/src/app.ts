import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { buildContext, type AppContext } from "@scenelock/api/context";
import { Services } from "@scenelock/api/services";
import { authenticate, hasScope, type Principal } from "./auth.js";
import { TOOL_BY_NAME, TOOLS, ToolError, type ToolDeps } from "./tools.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "radar-mcp", version: "0.1.0" };

interface RpcReq {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcReq["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}
function rpcError(id: RpcReq["id"], code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

/**
 * MCP routes as a plugin, so the API server can mount them on the SAME context
 * (shared DRY_RUN store) or they can run standalone via `buildMcp`.
 */
export function registerMcpRoutes(app: FastifyInstance, ctx: AppContext): void {
  const svc = new Services(ctx);
  const deps: ToolDeps = { services: svc, archivist: ctx.archivist, storage: ctx.storage };

  app.get("/mcp/health", async () => ({ status: "ok", service: "@scenelock/mcp", tools: TOOLS.length }));

  app.post<{ Body: RpcReq }>("/mcp", async (req, reply) => {
    const body = req.body;
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
      return reply.code(400).send(rpcError(body?.id ?? null, -32600, "invalid JSON-RPC request"));
    }

    const principal = await authenticate(ctx.storage, req.headers.authorization);
    if (!principal) {
      return reply.code(401).send(rpcError(body.id, -32001, "invalid or missing bearer token"));
    }

    try {
      switch (body.method) {
        case "initialize":
          return rpcResult(body.id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          });
        case "ping":
          return rpcResult(body.id, {});
        case "tools/list":
          return rpcResult(body.id, {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              _meta: { scope: t.scope },
            })),
          });
        case "tools/call": {
          const name = String(body.params?.name ?? "");
          const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
          const tool = TOOL_BY_NAME.get(name);
          if (!tool) return rpcError(body.id, -32601, `unknown tool "${name}"`);

          const paramsHash = createHash("sha256").update(JSON.stringify(args)).digest("hex");

          if (!hasScope(principal, tool.scope)) {
            await audit(ctx, principal, `mcp.${name}`, paramsHash, { denied: "scope", need: tool.scope });
            return rpcError(body.id, -32003, `token missing required scope "${tool.scope}"`);
          }

          await audit(ctx, principal, `mcp.${name}`, paramsHash, {});
          const result = await tool.handler(deps, args, principal);
          return rpcResult(body.id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
            isError: false,
          });
        }
        default:
          return rpcError(body.id, -32601, `method not found: ${body.method}`);
      }
    } catch (err) {
      if (err instanceof ToolError) return rpcError(body.id, err.code, err.message);
      return rpcError(body.id, -32603, `internal error: ${(err as Error).message}`);
    }
  });
}

/**
 * Radar MCP server (spec §9, E.6). JSON-RPC 2.0 over HTTP — the wire shape of
 * MCP streamable-HTTP. Swapping in the official SDK transport later leaves the
 * tool handlers (the actual content) untouched.
 */
export function buildMcp(ctx: AppContext = buildContext()): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ status: "ok", service: "@scenelock/mcp", tools: TOOLS.length }));
  registerMcpRoutes(app, ctx);
  return app;
}

async function audit(
  ctx: AppContext,
  p: Principal,
  action: string,
  paramsHash: string,
  meta: Record<string, unknown>,
) {
  await ctx.storage.appendAuditEntry({
    entry_id: ctx.ids.next("aud"),
    org_id: p.org_id,
    at: ctx.clock.now(),
    principal: p.prefix,
    action,
    params_hash: paramsHash,
    meta,
  });
}
