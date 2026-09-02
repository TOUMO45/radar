import { type NextRequest } from "next/server";

/**
 * BFF proxy (spec D.2). The browser never talks to the core API directly; it
 * calls /api/* here and this handler forwards to SCENELOCK_API_BASE, attaching
 * auth context server-side. For P1 (local, no Identity Platform yet) it forwards
 * the role/user headers the console sets; JWT verification lands in P3.
 */
const BASE = process.env.SCENELOCK_API_BASE ?? "http://localhost:4000";
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

async function forward(req: NextRequest, path: string[]) {
  const url = `${BASE}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.has(k)) headers.set(k, v);
  });
  // context injection point (P3: derive these from the verified session JWT)
  headers.set("x-scenelock-role", req.headers.get("x-scenelock-role") ?? "qa_reviewer");
  headers.set("x-scenelock-user", req.headers.get("x-scenelock-user") ?? "u_console");

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
