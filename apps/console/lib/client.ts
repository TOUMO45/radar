"use client";

/** Browser-side data access — always through the BFF proxy (/api/*), never the core API directly (D.2). */

export const ROLES = ["producer", "qa_reviewer", "legal", "sre_admin", "viewer"] as const;
export type ConsoleRole = (typeof ROLES)[number];

const ROLE_KEY = "scenelock.role";

export function getRole(): ConsoleRole {
  if (typeof window === "undefined") return "qa_reviewer";
  try {
    const v = window.localStorage.getItem(ROLE_KEY);
    if (v && (ROLES as readonly string[]).includes(v)) return v as ConsoleRole;
  } catch {
    /* private mode / disabled storage */
  }
  return "qa_reviewer";
}

export function setRole(r: ConsoleRole): void {
  try {
    window.localStorage.setItem(ROLE_KEY, r);
  } catch {
    /* ignore */
  }
}

export async function clientFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-scenelock-role": getRole(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText);
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
