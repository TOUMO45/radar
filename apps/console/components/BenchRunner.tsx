"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientFetch, getRole } from "@/lib/client";

/**
 * One button over `POST /v1/bench/run` (Producer/SRE only, gated in
 * services/api/src/app.ts). Reuses KillSwitchControl's exact role-check +
 * busy/error pattern. On success it just refreshes — the page's server
 * component re-fetches `GET /v1/bench` and renders the fresh scorecard.
 */
export function BenchRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // getRole() reads localStorage — client-only. Gate the role-dependent
  // render on mount so SSR and first client render agree (no hydration
  // mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = getRole();
  const allowed = ["producer", "sre_admin"].includes(role);

  async function run() {
    setErr(null);
    setBusy(true);
    try {
      await clientFetch("v1/bench/run", { method: "POST", body: "{}" });
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  if (!allowed) {
    return (
      <span className="mono text-[11px] text-[var(--color-text-secondary)]">
        Producer or SRE can run the corpus (current role: {role}).
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="mono text-[12px] px-3 py-[6px] rounded-[6px] border disabled:opacity-40 transition-all enabled:hover:shadow-[0_0_24px_-6px_var(--color-accent)]"
        style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}
      >
        {busy ? "⟳ running corpus…" : "▶ run scorecard"}
      </button>
      {err && (
        <span className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>
          {err}
        </span>
      )}
    </div>
  );
}
