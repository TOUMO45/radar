"use client";

import { useState } from "react";
import type { QuickScanResult } from "@scenelock/schema";
import { SeverityBadge } from "./badges";
import { ApiError } from "@/lib/client";

/**
 * Quick Scan — a standalone, best-effort preliminary check. Deliberately NOT
 * the Finding Inbox component itself (QuickScanFinding is a lighter type —
 * no scene_id/blocking/status/entity_id, since a standalone scan has no
 * honest value for those production-only fields), but reuses the SAME visual
 * vocabulary: `panel`, `vmb-k`, SeverityBadge, the row layout.
 */
export function QuickScanPanel() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<QuickScanResult | null>(null);

  async function submit() {
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        // No content-type header here on purpose — the browser sets the
        // correct multipart/form-data boundary itself. clientFetch() always
        // forces application/json, which would break the upload, so this
        // goes through the same /api/* BFF path with a direct fetch instead.
        res = await fetch("/api/v1/quickscan", { method: "POST", body: form });
      } else {
        res = await fetch("/api/v1/quickscan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText);
      setResult(body as QuickScanResult);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = (text.trim().length > 0 || file !== null) && !busy;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-3 flex flex-col gap-2">
        <span className="vmb-k">paste script text</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) setFile(null);
          }}
          placeholder="Paste a script excerpt, scene description, or any text to check…"
          rows={6}
          className="bg-[var(--color-bg-raise)] border rounded-[4px] p-2 text-[12px] mono resize-y"
        />
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
          <span>— or —</span>
        </div>
        <span className="vmb-k">upload an image or video</span>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) setText("");
          }}
          className="mono text-[12px]"
        />
        {file && (
          <span className="mono text-[11px] text-[var(--color-text-secondary)]">
            selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
          </span>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="mono text-[12px] px-3 py-1 rounded-[2px] border self-start disabled:opacity-40"
          style={{ color: "var(--color-source-deterministic)", borderColor: "var(--color-source-deterministic)" }}
        >
          {busy ? "scanning…" : "▶ run Quick Scan"}
        </button>

        {err && (
          <div className="mono text-[11px]" style={{ color: "var(--color-status-error)" }}>
            {err}
          </div>
        )}
      </div>

      {result && <QuickScanResultView result={result} />}
    </div>
  );
}

function QuickScanResultView({ result }: { result: QuickScanResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="panel p-3 text-[11px] text-[var(--color-text-secondary)]"
        style={{ borderLeft: "3px solid var(--color-status-held)" }}
      >
        {result.disclaimer}
      </div>

      <div className="panel overflow-hidden">
        <div className="vmb-k px-3 py-2 border-b">
          {result.findings.length} finding{result.findings.length === 1 ? "" : "s"} · scan {result.scan_id}
        </div>
        <div className="flex flex-col">
          {result.findings.map((f, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 border-b last:border-b-0">
              <SeverityBadge severity={f.severity} />
              <span className="mono text-[11px] text-[var(--color-text-secondary)] w-32 shrink-0 mt-[2px]">
                {f.risk_class}
              </span>
              <div className="flex-1">
                <div>{f.description}</div>
                <div className="text-[11px] text-[var(--color-text-secondary)] mt-[2px]">↳ {f.recommendation}</div>
                {f.evidence_quote && (
                  <pre className="mono text-[11px] mt-1 p-2 rounded-[4px] whitespace-pre-wrap" style={{ background: "var(--color-bg-raise)" }}>
                    {f.evidence_quote}
                  </pre>
                )}
              </div>
              <span className="mono text-[11px] w-14 text-right mt-[2px]">{f.confidence.toFixed(2)}</span>
            </div>
          ))}
          {result.findings.length === 0 && (
            <div className="px-3 py-6 text-[var(--color-text-secondary)]">
              Radar quiet — nothing flagged against Quick Scan's watchlist.
            </div>
          )}
        </div>
      </div>

      {result.not_applicable.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="vmb-k px-3 py-2 border-b">
            {result.not_applicable.length} axis{result.not_applicable.length === 1 ? "" : "es"} not checked — why
          </div>
          <div className="flex flex-col">
            {result.not_applicable.map((n) => (
              <div key={n.axis} className="px-3 py-2 border-b last:border-b-0 text-[12px]">
                <span className="mono text-[11px] uppercase text-[var(--color-text-secondary)]">{n.axis}</span>
                <div className="text-[var(--color-text-secondary)] mt-[2px]">{n.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
