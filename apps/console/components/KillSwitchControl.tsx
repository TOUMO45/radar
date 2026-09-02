"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientFetch, getRole } from "@/lib/client";

/** C-20 KillSwitchControl — Producer/SRE only; confirms with a typed phrase; pauses the loop (E.12). */
export function KillSwitchControl({ pid, engaged }: { pid: string; engaged: boolean }) {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const role = getRole();
  const allowed = ["producer", "sre_admin"].includes(role);

  async function toggle(next: boolean) {
    setErr(null);
    setBusy(true);
    try {
      await clientFetch(`v1/productions/${pid}/kill-switch`, {
        method: "POST",
        body: JSON.stringify({ engaged: next, phrase: next ? phrase : undefined }),
      });
      setPhrase("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="vmb-k">kill switch</span>
        <span
          className="mono text-[11px]"
          style={{ color: engaged ? "var(--color-status-error)" : "var(--color-status-locked)" }}
        >
          {engaged ? "ENGAGED — loop paused, verdict HELD" : "clear"}
        </span>
      </div>
      {!allowed ? (
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Producer or SRE only (current role: {role}).
        </div>
      ) : engaged ? (
        <button
          onClick={() => toggle(false)}
          disabled={busy}
          className="mono text-[12px] px-3 py-1 rounded-[2px] border self-start disabled:opacity-40"
          style={{ color: "var(--color-status-locked)", borderColor: "var(--color-status-locked)" }}
        >
          {busy ? "…" : "resume loop"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder='type "PAUSE LOOP"'
            className="bg-[var(--color-bg-raise)] border rounded-[2px] px-2 py-1 mono text-[12px]"
          />
          <button
            onClick={() => toggle(true)}
            disabled={busy || phrase !== "PAUSE LOOP"}
            className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
            style={{ color: "var(--color-status-error)", borderColor: "var(--color-status-error)" }}
          >
            {busy ? "…" : "engage"}
          </button>
        </div>
      )}
      {err && <div className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>{err}</div>}
    </div>
  );
}
