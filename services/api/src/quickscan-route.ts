import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { runQuickScan } from "@scenelock/quickscan";
import type { QuickScanResult } from "@scenelock/schema";
import { rateLimit } from "./rate-limit.js";
import { getScan, putScan } from "./quickscan-store.js";
import { annotate } from "./grafana.js";

/**
 * Quick Scan route (additive capability — see packages/schema/src/quickscan.ts
 * and services/quickscan/src/index.ts for the full design). Registered as its
 * OWN Fastify plugin, mounted once from app.ts, so every piece of it —
 * the multipart content-type parser, the rate limiter, the route itself —
 * stays isolated from the other existing routes:
 *   - `@fastify/multipart` only activates for requests whose Content-Type is
 *     actually multipart/form-data; it changes nothing about how any existing
 *     route parses its own body (Fastify picks a parser per request by
 *     Content-Type, not globally).
 *   - The rate limiter is the shared `rateLimit` preHandler (services/api/src/
 *     rate-limit.ts) attached to this route via Fastify's own per-route
 *     `preHandler` mechanism — not a global plugin.
 *
 * No production_id, no auth beyond this rate limit — this is a deliberately
 * public-ish entry point; every input is treated as untrusted (size-capped
 * upload, temp file always cleaned up, no path ever trusted from the client).
 *
 * Feature 3 (additive): every result is persisted under a strong random
 * `scan_id` (128 bits — deliberately not repeating the 32-bit scan_id the
 * pure function mints, nor the old 16-bit verify-slug lesson) so it can be
 * re-opened read-only at GET /v1/quickscan/:scanId.
 */

const MAX_TEXT_LEN = 20_000; // ~20k chars, generous for a script excerpt
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

function mimeToKind(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Overwrite the pure function's weak scan_id with a strong one, persist, annotate, return. */
async function persistAndReturn(result: QuickScanResult): Promise<QuickScanResult> {
  const scan_id = `qs_${randomBytes(16).toString("hex")}`; // 128 bits of entropy
  const shared: QuickScanResult = { ...result, scan_id };
  putScan(scan_id, shared);
  await annotate(
    `Quick Scan run: ${shared.findings.length} finding${shared.findings.length === 1 ? "" : "s"} (${shared.input_type})`,
    ["quickscan"],
  );
  return shared;
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
          return await persistAndReturn(result);
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
      return await persistAndReturn(result);
    },
  );

  // Feature 3 — re-open a persisted scan, public + read-only, no rate limit
  // (same as every other GET on this API).
  app.get<{ Params: { scanId: string } }>("/v1/quickscan/:scanId", async (req, reply) => {
    const found = getScan(req.params.scanId);
    if (!found) return reply.code(404).send({ error: "scan not found (it may have expired on a cold start)" });
    return found;
  });
}
