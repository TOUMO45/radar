import { type NextRequest } from "next/server";

/**
 * SSE pass-through (D.2 / D.4). The generic BFF proxy buffers bodies, which never
 * completes for an event stream, so this route pipes the core API's stream
 * straight through. JWT verification will slot in here in P3.
 */
export const dynamic = "force-dynamic";

const BASE = process.env.SCENELOCK_API_BASE ?? "http://localhost:4000";

export async function GET(req: NextRequest, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  const upstream = await fetch(`${BASE}/v1/stream/productions/${pid}`, {
    headers: { accept: "text/event-stream" },
    signal: req.signal,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
