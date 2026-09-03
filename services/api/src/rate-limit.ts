import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Minimal in-memory, per-IP rate limiter — extracted verbatim from
 * quickscan-route.ts so more than one route can share the exact same
 * preHandler (spec: "rate-limit exactly like /v1/quickscan — reuse that
 * preHandler"). Behaviour is unchanged: one 60s sliding window, 10 requests
 * per IP per window, shared across every route that attaches this handler.
 *
 * This is a DRY_RUN convenience, process-local (same seam class as the
 * in-memory storage / event bus). A real deployment swaps it for
 * @fastify/rate-limit backed by Redis.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return done();
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    reply.code(429).send({ error: `rate limit exceeded — max ${MAX_PER_WINDOW} scans per minute` });
    return; // do not call done() — short-circuits the route
  }
  done();
}

/** Test-only: clear the shared window so suites don't bleed into each other. */
export function __resetRateLimit(): void {
  hits.clear();
}
