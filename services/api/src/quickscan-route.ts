import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { runQuickScan } from "@scenelock/quickscan";

/**
 * Quick Scan route (additive capability — see packages/schema/src/quickscan.ts
 * and services/quickscan/src/index.ts for the full design). Registered as its
 * OWN Fastify plugin, mounted once from app.ts, so every piece of it —
 * the multipart content-type parser, the rate limiter, the route itself —
 * stays isolated from the other 47 existing routes:
 *   - `@fastify/multipart` only activates for requests whose Content-Type is
 *     actually multipart/form-data; it changes nothing about how any existing
 *     route parses its own body (Fastify picks a parser per request by
 *     Content-Type, not globally).
 *   - The rate limiter below is a plain `preHandler` attached to this ONE
 *     route via Fastify's own per-route `config`/`preHandler` mechanism —
 *     not a global plugin — so there is no scoping ambiguity to get wrong.
 *
 * No production_id, no auth beyond this rate limit — this is a deliberately
 * public-ish entry point; every input is treated as untrusted (size-capped
 * upload, temp file always cleaned up, no path ever trusted from the client).
 */

const MAX_TEXT_LEN = 20_000; // ~20k chars, generous for a script excerpt
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

// --- minimal in-memory rate limiter, scoped to THIS route only -------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimit(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
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

function mimeToKind(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export async function registerQuickScanRoute(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  app.post(
    "/v1/quickscan",
    { preHandler: rateLimit },
    async (req, reply) => {
      const contentType = req.headers["content-type"] ?? "";

      if (contentType.startsWith("multipart/form-data")) {
        const file = await req.file();
        if (!file) return reply.code(422).send({ error: "no file field found in multipart body" });
        const kind = mimeToKind(file.mimetype);
        if (!kind) return reply.code(415).send({ error: `unsupported content type: ${file.mimetype} (expected image/* or video/*)` });

        const tmpPath = join(tmpdir(), `radar-quickscan-${randomUUID()}`);
        try {
          await pipeline(file.file, createWriteStream(tmpPath));
          if (file.file.truncated) {
            return reply.code(413).send({ error: `file exceeds the ${MAX_UPLOAD_BYTES} byte limit` });
          }
          const result = await runQuickScan({ kind, assetPath: tmpPath });
          return result;
        } finally {
          await unlink(tmpPath).catch(() => {});
        }
      }

      // default: JSON body { text: string }
      const body = req.body as { text?: unknown } | undefined;
      if (typeof body?.text !== "string" || !body.text.trim()) {
        return reply.code(422).send({ error: "provide either a multipart file upload or a JSON body { text: string }" });
      }
      if (body.text.length > MAX_TEXT_LEN) {
        return reply.code(413).send({ error: `text exceeds the ${MAX_TEXT_LEN} character limit` });
      }
      const result = await runQuickScan({ kind: "text", text: body.text });
      return result;
    },
  );
}
