"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientFetch } from "@/lib/client";

/** One-take demo spine (H.2): reset → gates → held → self-heal → certified. */
export function DemoRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "run" | "reset">(null);
  const [line, setLine] = useState<string | null>(null);

  async function call(kind: "run" | "reset") {
    setBusy(kind);
    setLine(null);
    try {
      if (kind === "reset") {
        await clientFetch("v1/demo/reset", { method: "POST" });
        setLine("seed reloaded — scene HELD, 3 blocking");
      } else {
        const r = await clientFetch<{
          verdict: { verdict: string } | null;
          certificate: { slug: string } | null;
        }>("v1/demo/run", { method: "POST" });
        setLine(
          r.verdict?.verdict === "LOCKED"
            ? `LOCKED — certificate ${r.certificate?.slug ?? "(none)"} signed`
            : `ended ${r.verdict?.verdict ?? "?"}`,
        );
      }
      router.refresh();
    } catch (e) {
      setLine(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel p-3 flex items-center gap-3">
      <span className="vmb-k">demo spine</span>
      <button
        onClick={() => call("run")}
        disabled={busy !== null}
        className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
        style={{ color: "var(--color-status-held)", borderColor: "var(--color-status-held)" }}
      >
        {busy === "run" ? "running Acts 1–3…" : "▶ run demo (Acts 1–3)"}
      </button>
      <button
        onClick={() => call("reset")}
        disabled={busy !== null}
        className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
        style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-line-hair)" }}
      >
        {busy === "reset" ? "…" : "reset"}
      </button>
      {line && <span className="mono text-[11px] text-[var(--color-source-deterministic)]">{line}</span>}
    </div>
  );
}
