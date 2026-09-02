import type { FindingSource, Severity, Verdict, VerdictReason } from "@scenelock/schema";

/** C-04 SeverityBadge — info/low/medium/high ramp. */
const SEVERITY_COLOR: Record<Severity, string> = {
  info: "var(--color-status-info)",
  low: "#6E8BFF",
  medium: "var(--color-status-held)",
  high: "var(--color-status-error)",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className="mono text-[11px] uppercase px-[6px] py-[1px] rounded-[2px] border"
      style={{ color: SEVERITY_COLOR[severity], borderColor: SEVERITY_COLOR[severity] }}
    >
      {severity}
    </span>
  );
}

/** C-05 SourceBadge — deterministic/model/hybrid (cyan/violet/teal). */
const SOURCE_COLOR: Record<FindingSource, string> = {
  deterministic: "var(--color-source-deterministic)",
  model: "var(--color-source-model)",
  hybrid: "var(--color-source-hybrid)",
};

export function SourceBadge({ source }: { source: FindingSource }) {
  return (
    <span
      className="mono text-[11px] px-[6px] py-[1px] rounded-[2px]"
      style={{ color: SOURCE_COLOR[source], background: "var(--color-bg-raise)" }}
    >
      {source}
    </span>
  );
}

/** C-03 StatusChip — scene/shot/verdict states. */
const VERDICT_COLOR: Record<Verdict, string> = {
  LOCKED: "var(--color-status-locked)",
  HELD: "var(--color-status-held)",
  CERTIFIED: "var(--color-status-certified)",
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className="mono text-[12px] font-medium uppercase px-2 py-[2px] rounded-[2px] border"
      style={{ color: VERDICT_COLOR[verdict], borderColor: VERDICT_COLOR[verdict] }}
    >
      {verdict}
    </span>
  );
}

export const REASON_COPY: Record<VerdictReason, string> = {
  ok: "all lock conditions met",
  open_blocking_findings: "open blocking findings",
  incomplete_gate_coverage: "incomplete gate coverage",
  incomplete_c2pa_coverage: "incomplete C2PA coverage",
  shots_not_ready: "shots still in the pipeline",
  kill_switch_engaged: "kill switch engaged",
};
