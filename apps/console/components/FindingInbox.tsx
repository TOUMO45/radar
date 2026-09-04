"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Finding } from "@scenelock/schema";
import { SeverityBadge, SourceBadge } from "./badges";
import { AdjudicationPanel } from "./AdjudicationPanel";
import { ApiError, clientFetch } from "@/lib/client";

type StatusFilter = "all" | "open" | "resolved" | "waived";
type BlockingFilter = "all" | "blocking" | "non_blocking";

/** S4 Finding Inbox — cross-scene triage, keyboard-first. Drawer = S5 dossier. */
export function FindingInbox({ findings: initial }: { findings: Finding[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [blocking, setBlocking] = useState<BlockingFilter>("all");
  const [gate, setGate] = useState<string>("all");
  const [sel, setSel] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const gates = useMemo(
    () => Array.from(new Set(initial.map((f) => f.gate))).sort(),
    [initial],
  );

  const filtered = useMemo(
    () =>
      rows
        .filter((f) => (status === "all" ? true : f.status === status))
        .filter((f) =>
          blocking === "all"
            ? true
            : blocking === "blocking"
              ? f.blocking
              : !f.blocking,
        )
        .filter((f) => (gate === "all" ? true : f.gate === gate))
        .sort(
          (a, b) =>
            Number(b.blocking) - Number(a.blocking) ||
            a.created_at.localeCompare(b.created_at),
        ),
    [rows, status, blocking, gate],
  );

  useEffect(() => {
    if (sel >= filtered.length) setSel(Math.max(0, filtered.length - 1));
  }, [filtered.length, sel]);

  const confirm = useCallback(
    async (f: Finding) => {
      try {
        await clientFetch(`v1/findings/${f.finding_id}/adjudication`, {
          method: "POST",
          body: JSON.stringify({ decision: "confirm", reason: "confirmed from inbox" }),
        });
        setRows((r) =>
          r.map((x) => (x.finding_id === f.finding_id ? { ...x, status: "resolved" } : x)),
        );
        setFlash(`confirmed ${f.finding_id}`);
        router.refresh();
      } catch (e) {
        setFlash(e instanceof ApiError ? e.message : String(e));
      }
    },
    [router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const cur = filtered[sel];
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && cur) {
        setOpenId(cur.finding_id);
      } else if (e.key === "Escape") {
        setOpenId(null);
      } else if (e.key === "c" && cur && cur.status === "open") {
        void confirm(cur);
      } else if (e.key === "w" && cur) {
        setOpenId(cur.finding_id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, sel, confirm]);

  const openFinding = rows.find((f) => f.finding_id === openId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] flex-wrap">
        <Chips label="status" value={status} set={setStatus} opts={["all", "open", "resolved", "waived"]} />
        <Chips
          label="blocking"
          value={blocking}
          set={setBlocking}
          opts={["all", "blocking", "non_blocking"]}
        />
        <Chips label="gate" value={gate} set={setGate} opts={["all", ...gates]} />
        <span className="ml-auto mono text-[var(--color-text-secondary)]">
          J/K move · Enter open · C confirm · W waive · Esc close
        </span>
      </div>

      {flash && (
        <div className="mono text-[11px] text-[var(--color-source-deterministic)]">{flash}</div>
      )}

      <div className="panel-hero overflow-hidden rise">
        <div className="hud h-eyebrow px-4 py-3 border-b bg-[var(--color-bg-raise)] flex items-center gap-2">
          <span>{filtered.length} findings</span>
          <span className="text-[var(--color-text-faint)]">·</span>
          <span style={{ color: filtered.some((f) => f.blocking) ? "var(--color-status-error)" : undefined }}>
            {filtered.filter((f) => f.blocking).length} blocking
          </span>
        </div>
        <div className="flex flex-col stagger">
          {filtered.map((f, i) => (
            <button
              key={f.finding_id}
              onClick={() => {
                setSel(i);
                setOpenId(f.finding_id);
              }}
              className="flex items-center gap-3 px-3 py-[10px] border-b last:border-b-0 text-left transition-colors hover:bg-[var(--color-bg-raise)]"
              style={{ background: i === sel ? "var(--color-bg-raise)" : undefined }}
            >
              <span
                className="w-1 h-8 rounded-[2px] shrink-0"
                style={{
                  background: f.blocking ? "var(--color-status-error)" : "var(--color-line-hair)",
                }}
              />
              <SeverityBadge severity={f.severity} />
              <SourceBadge source={f.source} />
              <span className="mono text-[11px] text-[var(--color-text-secondary)] w-32 shrink-0">
                {f.risk_class}
              </span>
              <span className="flex-1 truncate">{f.description}</span>
              <span className="mono text-[11px] text-[var(--color-text-secondary)] w-16 text-right">
                {f.shot_id ?? "—"}
              </span>
              <span className="mono text-[11px] w-16 text-right">{f.confidence.toFixed(2)}</span>
              <span
                className="mono text-[11px] w-28 text-right"
                style={{
                  color:
                    f.status === "open"
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                }}
              >
                {f.stage} · {f.status}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-[var(--color-text-secondary)]">
              Radar quiet — no findings match these filters.
            </div>
          )}
        </div>
      </div>

      {openFinding && (
        <FindingDrawer finding={openFinding} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function Chips<T extends string>({
  label,
  value,
  set,
  opts,
}: {
  label: string;
  value: T;
  set: (v: T) => void;
  opts: readonly T[];
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="vmb-k">{label}</span>
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => set(o)}
          className="mono px-2 py-[2px] rounded-[3px] border"
          style={{
            color: o === value ? "var(--color-bg-base)" : "var(--color-text-secondary)",
            background: o === value ? "var(--color-accent)" : "transparent",
            borderColor: o === value ? "var(--color-accent)" : "var(--color-line-hair)",
            boxShadow: o === value ? "0 0 12px -4px var(--color-accent)" : "none",
          }}
        >
          {o}
        </button>
      ))}
    </span>
  );
}

/** C-08 FindingDossier (drawer variant) — full schema view + adjudication. */
function FindingDrawer({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] fade-in" />
      <div
        className="relative w-[520px] max-w-[92vw] h-full overflow-y-auto p-5 flex flex-col gap-3 slide-in"
        style={{ background: "var(--color-bg-panel)", borderLeft: "1px solid var(--color-line-soft)", boxShadow: "-24px 0 60px -20px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="mono text-[14px]">{finding.finding_id}</span>
          {finding.blocking && (
            <span
              className="mono text-[11px] px-2 py-[1px] rounded-[2px] border"
              style={{ color: "var(--color-status-error)", borderColor: "var(--color-status-error)" }}
            >
              BLOCKING
            </span>
          )}
          <button onClick={onClose} className="ml-auto mono text-[12px] text-[var(--color-text-secondary)]">
            esc ✕
          </button>
        </div>

        <div className="text-[13px]">{finding.description}</div>
        {finding.recommendation && (
          <div className="text-[12px] text-[var(--color-text-secondary)]">
            → {finding.recommendation}
          </div>
        )}

        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[12px] mono">
          <Row k="gate" v={`${finding.gate}${finding.sub_gate ? `/${finding.sub_gate}` : ""}`} />
          <Row k="risk_class" v={finding.risk_class} />
          <Row k="rule" v={finding.rule} />
          <Row k="stage" v={finding.stage} />
          <Row k="severity" v={finding.severity} />
          <Row k="source" v={finding.source} />
          <Row k="confidence" v={finding.confidence.toFixed(2)} />
          {finding.measurement && (
            <Row
              k="measurement"
              v={`${finding.measurement.metric} = ${finding.measurement.value}${
                finding.measurement.threshold !== undefined
                  ? ` (τ ${finding.measurement.threshold})`
                  : ""
              }`}
            />
          )}
          {finding.entity_id && <Row k="entity" v={finding.entity_id} />}
          {finding.state_expected && <Row k="expected" v={finding.state_expected} />}
          {finding.state_observed && <Row k="observed" v={finding.state_observed} />}
          <Row k="status" v={finding.status} />
          {finding.shot_id && <Row k="shot" v={finding.shot_id} />}
        </dl>

        {finding.evidence_quote && (
          <div>
            <span className="vmb-k">evidence quote</span>
            <pre className="mono text-[11px] mt-1 p-2 rounded-[4px] whitespace-pre-wrap"
              style={{ background: "var(--color-bg-raise)" }}>
              {finding.evidence_quote}
            </pre>
          </div>
        )}

        <AdjudicationPanel finding={finding} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[var(--color-text-secondary)]">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
