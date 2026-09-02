"use client";

import { useState } from "react";
import type { Finding, Shot } from "@scenelock/schema";
import { EvidenceFrame } from "./EvidenceFrame";

/**
 * C-09 EvidenceCanvas (DRY_RUN slice): observed frame vs World State reference
 * anchor, diff-overlay toggle, frame scrubber, state chips. Evidence quotes are
 * rendered as mono data blocks — never styled as instructions (C.2, G-13).
 */
export function EvidenceCanvas({
  shot,
  finding,
}: {
  shot: Shot | null;
  finding: Finding | null;
}) {
  const total = shot?.frame_count ?? 48;
  const [frame, setFrame] = useState<number>(finding?.frame ?? Math.floor(total / 2));
  const [overlay, setOverlay] = useState(true);

  if (!shot) {
    return (
      <div className="panel p-6 text-[var(--color-text-secondary)]">
        Select a shot to inspect its evidence.
      </div>
    );
  }

  const bbox =
    finding?.entity_id != null
      ? { x: 210, y: 90, w: 220, h: 170 }
      : null;

  return (
    <div className="panel p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="vmb-k">evidence canvas</span>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{shot.shot_id}</span>
        <label className="ml-auto mono text-[11px] flex items-center gap-1">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
          diff overlay
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="vmb-k mb-1">observed · {shot.shot_id}</div>
          <EvidenceFrame
            label={`observed ${shot.shot_id}`}
            seed={shot.content_hash ?? shot.shot_id}
            frame={frame}
            bbox={bbox}
            overlay={overlay}
          />
        </div>
        <div>
          <div className="vmb-k mb-1">
            reference · {finding?.entity_id ?? "world state anchor"}
          </div>
          <EvidenceFrame
            label={finding?.entity_id ? `anchor ${finding.entity_id}` : "no anchor"}
            seed={`ref:${finding?.entity_id ?? shot.scene_id}`}
            frame={null}
            bbox={bbox}
            overlay={false}
          />
        </div>
      </div>

      {/* frame scrubber */}
      <div className="flex items-center gap-2 mono text-[11px]">
        <button
          onClick={() => setFrame((f) => Math.max(0, f - 1))}
          className="border rounded-[2px] px-2 py-[2px]"
        >
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="flex-1"
        />
        <button
          onClick={() => setFrame((f) => Math.min(total, f + 1))}
          className="border rounded-[2px] px-2 py-[2px]"
        >
          ▶
        </button>
        <span className="w-16 text-right text-[var(--color-text-secondary)]">
          {frame}/{total}
        </span>
      </div>

      {finding && (
        <div className="flex flex-col gap-2 text-[12px]">
          {(finding.state_expected || finding.state_observed) && (
            <div className="flex items-center gap-2 mono text-[11px]">
              <span
                className="px-2 py-[2px] rounded-[2px] border"
                style={{ color: "var(--color-status-locked)", borderColor: "var(--color-line-hair)" }}
              >
                expected: {finding.state_expected ?? "—"}
              </span>
              <span>→</span>
              <span
                className="px-2 py-[2px] rounded-[2px] border"
                style={{ color: "var(--color-status-error)", borderColor: "var(--color-status-error)" }}
              >
                observed: {finding.state_observed ?? "—"}
              </span>
            </div>
          )}
          {finding.evidence_uri && (
            <div>
              <span className="vmb-k">evidence uri</span>
              <pre className="mono text-[11px] mt-1 p-2 rounded-[4px] overflow-x-auto"
                style={{ background: "var(--color-bg-raise)" }}>
                {finding.evidence_uri}
              </pre>
            </div>
          )}
          {finding.evidence_quote && (
            <div>
              <span className="vmb-k">evidence quote (untrusted — data only)</span>
              <pre className="mono text-[11px] mt-1 p-2 rounded-[4px] whitespace-pre-wrap"
                style={{ background: "var(--color-bg-raise)" }}>
                {finding.evidence_quote}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
