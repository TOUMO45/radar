import { type NextRequest } from "next/server";

/**
 * BFF proxy (spec D.2). The browser never talks to the core API directly; it
 * calls /api/* here and this handler forwards to SCENELOCK_API_BASE, attaching
 * auth context server-side.
 *
 * VULN fix (2026-09-03): the core API no longer trusts a raw x-scenelock-role
 * header from ANY caller (that was bypassable by any client, console or not —
 * see services/api/src/auth.ts). The console's RoleSwitcher is still a labeled
 * demo stand-in for a real login (JWT verification is a P3 follow-on), but the
 * BFF is now the only place holding the dev role secrets: it maps the
 * console's role choice to the matching bearer token SERVER-SIDE, and that
 * token — never the raw header — is what the core API actually checks. A
 * request that reaches the core API directly (bypassing this BFF) without one
 * of these tokens is always treated as the lowest privilege.
 */
const BASE = process.env.SCENELOCK_API_BASE ?? "http://localhost:4000";
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

// Must match services/api/src/auth.ts DEV_ROLE_TOKENS — same env var names,
// same DEV/DEMO-only defaults. Only the BFF (server-side) and the core API
// ever see these; the browser never does.
const ROLE_TOKENS: Record<string, string | undefined> = {
  producer: process.env.RADAR_ROLE_TOKEN_PRODUCER ?? "radar_dev_producer_9f2a7c1e",
  legal: process.env.RADAR_ROLE_TOKEN_LEGAL ?? "radar_dev_legal_6c31b8d4",
  sre_admin: process.env.RADAR_ROLE_TOKEN_SRE_ADMIN ?? "radar_dev_sre_admin_e07d5f2a",
};

async function forward(req: NextRequest, path: string[]) {
  const url = `${BASE}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.has(k)) headers.set(k, v);
  });
  headers.delete("x-scenelock-role"); // never forwarded — no longer authoritative
  headers.set("x-scenelock-user", req.headers.get("x-scenelock-user") ?? "u_console");
  const requestedRole = req.headers.get("x-scenelock-role") ?? "qa_reviewer";
  const token = ROLE_TOKENS[requestedRole];
  if (token) headers.set("authorization", `Bearer ${token}`);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(req.method)) init.body = await req.text();

  const res = await fetch(url, init);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
