import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Certifier } from "@scenelock/certifier";

/**
 * Public certificate verifier (spec G-16, F.1). No auth, no PII — just
 * `GET /verify/:slug` → status + hash chain, so an insurer or counsel can
 * independently confirm a certificate.
 */
export function registerVerifyRoute(app: FastifyInstance, certifier: Certifier): void {
  app.get<{ Params: { slug: string } }>("/verify/:slug", async (req, reply) => {
    const slug = req.params.slug.slice(0, 64);
    const result = await certifier.verify(slug);
    reply.header("cache-control", "public, max-age=30");
    return result;
  });
}

export function buildVerifier(certifier: Certifier): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  app.get("/health", async () => ({ status: "ok", service: "@scenelock/verifier" }));
  registerVerifyRoute(app, certifier);
  return app;
}
