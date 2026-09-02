"use client";

import { useState } from "react";
import { api, actions } from "@/lib/api";

/**
 * R5 — resolve a likeness_rights finding: pull quotes from digital-replica
 * licensing providers and execute one, filing the consent record so the finding
 * clears. Chained resolution, right where the finding shows.
 */
type Options = Awaited<ReturnType<typeof api.getLikenessOptions>>;

export function LikenessResolver({ shotId }: { shotId: string }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cleared, setCleared] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (!opts) setOpts(await api.getLikenessOptions(shotId));
  }
  async function clear(provider: string) {
    setBusy(provider);
    try {
      const r = await actions.clearLikeness(shotId, provider);
      if (r.ok) setCleared(`Cleared via ${provider} — consent ${r.clearance.consent.record_id} filed. Compliance findings ${r.compliance_before} → ${r.compliance_after}.`);
    } catch {
      setCleared("Clearance failed — check role/API.");
    } finally {
      setBusy(null);
    }
  }

  if (cleared) {
    return <div className="mono text-[11px] mt-1" style={{ color: "var(--color-status-locked)" }}>✓ {cleared}</div>;
  }

  if (!open) {
    return (
      <button onClick={load} className="mono text-[11px] mt-1 text-[var(--color-source-deterministic)] underline">
        resolve via licensing →
      </button>
    );
  }

  const eligible = (opts?.quotes ?? []).filter((q) => q.eligible);
  return (
    <div className="mt-2 flex flex-col gap-1">
      {eligible.length === 0 ? (
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">no eligible provider for {opts?.replica_kind}</span>
      ) : (
        eligible.map((q) => (
          <div key={q.quote_id} className="flex items-center gap-2 text-[11px]">
            <span className="mono">{q.provider_label}</span>
            <span className="text-[var(--color-text-secondary)]">${q.est_price_usd.toLocaleString()} · {q.turnaround_days}d · {q.scope}</span>
            <button
              onClick={() => clear(q.provider)}
              disabled={busy === q.provider}
              className="mono text-[10px] px-2 py-[2px] rounded-[2px] border"
              style={{ borderColor: "var(--color-status-locked)", color: "var(--color-status-locked)" }}
            >
              {busy === q.provider ? "clearing…" : "execute licence"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
