"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Finding, Scene, SceneVerdict, Shot } from "@scenelock/schema";
import { VerdictMathBar } from "./VerdictMathBar";
import { EvidenceCanvas } from "./EvidenceCanvas";
import { SeverityBadge, SourceBadge } from "./badges";
import { useSSE } from "@/lib/useSSE";
import { clientFetch, ApiError } from "@/lib/client";

const SHOT_RING: Record<string, string> = {
  gates_complete: "var(--color-status-locked)",
  held: "var(--color-status-held)",
  regenerating: "var(--color-source-model)",
  failed_infra: "var(--color-status-error)",
  locked: "var(--color-status-certified)",
};

/** S3 Scene War Room — filmstrip + evidence canvas + finding dossier + live loop. */
export function WarRoom({
  pid,
  scene,
  shots,
  verdict,
  findings,
}: {
  pid: string;
  scene: Scene;
  shots: Shot[];
  verdict: SceneVerdict;
  findings: Finding[];
}) {
  const router = useRouter();
  const [liveVerdict, setLiveVerdict] = useState(verdict);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...findings].sort(
        (a, b) => Number(b.blocking) - Number(a.blocking) || (a.shot_id ?? "").localeCompare(b.shot_id ?? ""),
      ),
    [findings],
  );

  const [activeShotId, setActiveShotId] = useState(
    sorted.find((f) => f.blocking)?.shot_id ?? shots[0]?.shot_id ?? null,
  );
  const [activeFindingId, setActiveFindingId] = useState<string | null>(
    sorted.find((f) => f.shot_id === activeShotId)?.finding_id ?? null,
  );

  useSSE(pid, (type, data) => {
    if (type === "verdict.changed") setLiveVerdict(data as SceneVerdict);
    if (type === "verdict.changed" || type === "finding.created" || type === "finding.updated") {
      router.refresh();
    }
  });

  const activeShot = shots.find((s) => s.shot_id === activeShotId) ?? null;
  const activeFinding = sorted.find((f) => f.finding_id === activeFindingId) ?? null;

  async function rerun() {
    setBusy(true);
    setFlash(null);
    try {
      const r = await clientFetch<{ shots: number; clearance_findings: number }>(
        `v1/scenes/${scene.scene_id}/rerun-gates`,
        { method: "POST" },
      );
      setFlash(`media-processor + clearance gate ran on ${r.shots} shots → ${r.clearance_findings} findings`);
      router.refresh();
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function autoRemediate() {
    setBusy(true);
    setFlash(null);
    try {
      const r = await clientFetch<{ results: Array<{ outcome: string }>; verdict: SceneVerdict }>(
        `v1/scenes/${scene.scene_id}/auto-remediate`,
        { method: "POST" },
      );
      const done = r.results.filter((x) => x.outcome === "resolved").length;
      setFlash(`loop ran: ${done}/${r.results.length} findings resolved → verdict ${r.verdict.verdict}`);
      setLiveVerdict(r.verdict);
      router.refresh();
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← {pid}
        </Link>
        <h1 className="text-[18px] font-medium">{scene.heading}</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{scene.scene_id}</span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={rerun}
            disabled={busy}
            className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
            style={{ color: "var(--color-source-deterministic)", borderColor: "var(--color-source-deterministic)" }}
          >
            {busy ? "running…" : "▶ rerun clearance gates"}
          </button>
          <button
            onClick={autoRemediate}
            disabled={busy}
            className="mono text-[12px] px-3 py-1 rounded-[2px] border disabled:opacity-40"
            style={{ color: "var(--color-status-held)", borderColor: "var(--color-status-held)" }}
          >
            {busy ? "running…" : "⟳ auto-remediate scene"}
          </button>
          <Link
            href={`/p/${pid}/findings`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            finding inbox →
          </Link>
        </div>
      </div>

      {flash && <div className="mono text-[11px] text-[var(--color-source-deterministic)]">{flash}</div>}

      <VerdictMathBar v={liveVerdict} />

      <div className="grid grid-cols-[150px_1fr_360px] gap-3">
        {/* filmstrip */}
        <div className="panel p-2 flex flex-col gap-1">
          <div className="vmb-k px-1 pb-1">shots</div>
          {shots.map((s) => {
            const nBlock = findings.filter((f) => f.shot_id === s.shot_id && f.blocking).length;
            return (
              <button
                key={s.shot_id}
                onClick={() => {
                  setActiveShotId(s.shot_id);
                  setActiveFindingId(sorted.find((f) => f.shot_id === s.shot_id)?.finding_id ?? null);
                }}
                className="text-left border rounded-[4px] px-2 py-1"
                style={{
                  borderLeft: `3px solid ${SHOT_RING[s.status] ?? "var(--color-line-hair)"}`,
                  background: s.shot_id === activeShotId ? "var(--color-bg-raise)" : undefined,
                }}
              >
                <div className="mono text-[12px]">{s.shot_id}</div>
                <div className="mono text-[10px] flex gap-1">
                  <span style={{ color: s.c2pa?.valid ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                    C2PA{s.c2pa?.valid ? "✓" : "✕"}
                  </span>
                  {nBlock > 0 && <span style={{ color: "var(--color-status-error)" }}>{nBlock}⛔</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* evidence canvas */}
        <EvidenceCanvas shot={activeShot} finding={activeFinding} />

        {/* finding dossier */}
        <div className="panel flex flex-col overflow-hidden">
          <div className="vmb-k px-3 py-2 border-b">
            findings · {findings.length} ({findings.filter((f) => f.blocking).length} blocking)
          </div>
          <div className="flex flex-col overflow-y-auto max-h-[520px]">
            {sorted.map((f) => (
              <button
                key={f.finding_id}
                onClick={() => {
                  setActiveFindingId(f.finding_id);
                  if (f.shot_id) setActiveShotId(f.shot_id);
                }}
                className="text-left px-3 py-2 border-b last:border-b-0 flex flex-col gap-1"
                style={{ background: f.finding_id === activeFindingId ? "var(--color-bg-raise)" : undefined }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1 h-4 rounded-[2px]"
                    style={{ background: f.blocking ? "var(--color-status-error)" : "var(--color-line-hair)" }}
                  />
                  <SeverityBadge severity={f.severity} />
                  <SourceBadge source={f.source} />
                  <span className="mono text-[10px] text-[var(--color-text-secondary)] ml-auto">
                    {f.shot_id}
                  </span>
                </div>
                <div className="text-[12px] leading-snug">{f.description}</div>
                <div className="mono text-[10px] text-[var(--color-text-secondary)]">
                  {f.risk_class} · {f.measurement ? `${f.measurement.metric} ${f.measurement.value}` : `conf ${f.confidence.toFixed(2)}`} · {f.status}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
