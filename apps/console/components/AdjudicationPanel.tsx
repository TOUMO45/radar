"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Finding } from "@scenelock/schema";
import { ApiError, clientFetch, getRole } from "@/lib/client";

/** C-16 AdjudicationPanel — Confirm / Waive-with-reason / Override (Flow C, D12). */
export function AdjudicationPanel({ finding }: { finding: Finding }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const role = getRole();
  const blockingHigh = finding.blocking && finding.severity === "high";
  const canWaiveBlockingHigh = ["producer", "legal"].includes(role);
  const settled = finding.status === "waived" || finding.status === "resolved";

  async function submit(decision: "confirm" | "waive" | "override") {
    setErr(null);
    setBusy(decision);
    try {
      const res = await clientFetch<{ finding_status: string }>(
        `v1/findings/${finding.finding_id}/adjudication`,
        { method: "POST", body: JSON.stringify({ decision, reason }) },
      );
      setDone(res.finding_status);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (settled || done) {
    return (
      <div className="panel p-3 text-[12px]">
        <span className="vmb-k">adjudication</span>
        <div className="mt-1">
          finding is <span className="mono">{done ?? finding.status}</span>
          {finding.adjudication ? (
            <span className="text-[var(--color-text-secondary)]">
              {" "}
              — {finding.adjudication.decision} by {finding.adjudication.by}
              {finding.adjudication.reason ? `: "${finding.adjudication.reason}"` : ""}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const reasonTooShort = reason.trim().length < 20;

  return (
    <div className="panel p-3 flex flex-col gap-2">
      <span className="vmb-k">adjudication panel</span>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason (required for waive/override, ≥ 20 chars — audit trail, D12)"
        rows={2}
        className="bg-[var(--color-bg-raise)] border rounded-[4px] p-2 text-[12px] mono resize-y"
      />
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className="mono"
          style={{ color: reasonTooShort ? "var(--color-text-secondary)" : "var(--color-status-locked)" }}
        >
          {reason.trim().length}/20
        </span>
        {blockingHigh && (
          <span
            className="mono"
            style={{
              color: canWaiveBlockingHigh
                ? "var(--color-text-secondary)"
                : "var(--color-status-held)",
            }}
          >
            blocking HIGH — waiver requires Producer or Legal
          </span>
        )}
      </div>

      {err && (
        <div className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>
          {err}
        </div>
      )}

      <div className="flex gap-2">
        <Btn label="Confirm" onClick={() => submit("confirm")} busy={busy === "confirm"} tone="locked" />
        <Btn
          label="Waive"
          onClick={() => submit("waive")}
          busy={busy === "waive"}
          tone="held"
          disabled={reasonTooShort || (blockingHigh && !canWaiveBlockingHigh)}
        />
        <Btn
          label="Override"
          onClick={() => submit("override")}
          busy={busy === "override"}
          tone="info"
          disabled={reasonTooShort}
        />
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  busy,
  tone,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  tone: "locked" | "held" | "info";
  disabled?: boolean;
}) {
  const color = `var(--color-status-${tone})`;
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
      style={{ color, borderColor: color }}
    >
      {busy ? "…" : label}
    </button>
  );
}
