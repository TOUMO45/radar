import {
  REQUIRED_GATES,
  type Finding,
  type FindingStatus,
  type SceneVerdict,
  type Shot,
  type VerdictInputs,
  type VerdictReason,
} from "@scenelock/schema";

/**
 * The lock rule, made total (spec E.4 + G-02).
 *
 *   LOCKED(scene) ⇔
 *     ∀ shot ∈ scene:
 *         shot.status = gates_complete
 *       ∧ ∀ gate ∈ {continuity, clearance(∀ sub-gates)}: gate_run.status = completed
 *       ∧ shot.c2pa = { present: true, valid: true }
 *     ∧ ¬∃ finding ∈ scene: unresolved ∧ blocking
 *
 *   blocking(f) ⇔ f.severity = "high" ∧ f.confidence ≥ τ ∧ f.stage = "shot"
 *
 * This module is the ONLY home for lock logic (decision D5). Grafana and the UI
 * render precomputed labels; they never recompute τ (G-14).
 *
 * Deviation from the literal E.4 text, made deliberately for correctness:
 * E.4 says "status = open". We treat `in_remediation` and `escalated` as
 * blocking too — a scene must not LOCK while the loop is still working a finding
 * or after the loop has given up on one. Only `resolved` and `waived` clear it.
 * The property test enforces this.
 */

/** Finding statuses that still hold a scene (see deviation note above). */
const UNRESOLVED_STATUSES: ReadonlySet<FindingStatus> = new Set<FindingStatus>([
  "open",
  "in_remediation",
  "escalated",
]);

export interface VerdictInput {
  scene_id: string;
  /** per-production confidence threshold τ (spec §7). */
  tau: number;
  config_version: string;
  kill_switch?: boolean;
  shots: Shot[];
  findings: Finding[];
  /** override the clock for deterministic snapshots/tests. */
  now?: () => string;
}

/** blocking(f) — the pure predicate from E.4. Independent of finding status. */
export function isBlocking(
  f: Pick<Finding, "severity" | "confidence" | "stage">,
  tau: number,
): boolean {
  return f.severity === "high" && f.confidence >= tau && f.stage === "shot";
}

function shotGatesComplete(shot: Shot): boolean {
  return REQUIRED_GATES.every((req) =>
    shot.gate_runs.some(
      (r) =>
        r.gate === req.gate &&
        (r.sub_gate ?? null) === req.sub_gate &&
        r.status === "completed",
    ),
  );
}

function shotC2paValid(shot: Shot): boolean {
  return shot.c2pa?.present === true && shot.c2pa?.valid === true;
}

// Ordering rationale: a *silently* under-QA'd scene is the worst outcome, so
// pipeline-not-ready and crashed-gate coverage (G-02) rank above findings. A
// missing C2PA manifest, by contrast, always has a matching deterministic
// ai_disclosure finding (E.9) — the finding is the more actionable headline, so
// open_blocking_findings ranks above incomplete_c2pa_coverage.
const REASON_PRIORITY: VerdictReason[] = [
  "kill_switch_engaged",
  "shots_not_ready",
  "incomplete_gate_coverage",
  "open_blocking_findings",
  "incomplete_c2pa_coverage",
  "ok",
];

function worstReason(reasons: Set<VerdictReason>): VerdictReason {
  for (const r of REASON_PRIORITY) if (reasons.has(r)) return r;
  return "ok";
}

export function computeVerdict(input: VerdictInput): SceneVerdict {
  const now = input.now ?? (() => new Date().toISOString());
  const { shots, findings, tau } = input;

  const shotShots = shots.filter((s) => s.status !== "planned");

  // --- shot-level coverage (E.4 conjunction) ---
  let shotsReady = 0;
  let requiredGateRuns = 0;
  let completedGateRuns = 0;
  let c2paValidCount = 0;

  for (const shot of shotShots) {
    requiredGateRuns += REQUIRED_GATES.length;
    completedGateRuns += REQUIRED_GATES.filter((req) =>
      shot.gate_runs.some(
        (r) =>
          r.gate === req.gate &&
          (r.sub_gate ?? null) === req.sub_gate &&
          r.status === "completed",
      ),
    ).length;

    if (shot.status === "gates_complete" || shot.status === "locked") shotsReady += 1;
    if (shotC2paValid(shot)) c2paValidCount += 1;
  }

  // `shots_not_ready` is a *pipeline* state (still generating / regenerating /
  // failed_infra). Gate coverage is judged separately from gate_runs so a
  // crashed gate on an otherwise-ready shot surfaces as incomplete_gate_coverage
  // (G-02), not shots_not_ready.
  const allShotsStatusReady =
    shotShots.length > 0 &&
    shotShots.every((s) => s.status === "gates_complete" || s.status === "locked");
  const allGatesCovered =
    requiredGateRuns > 0 &&
    completedGateRuns === requiredGateRuns &&
    shotShots.every(shotGatesComplete);
  const allC2paValid =
    shotShots.length > 0 && c2paValidCount === shotShots.length;

  // --- findings (E.4) ---
  const blockingUnresolved = findings.filter(
    (f) => isBlocking(f, tau) && UNRESOLVED_STATUSES.has(f.status),
  );

  // --- assemble reasons ---
  const reasons = new Set<VerdictReason>();
  if (input.kill_switch) reasons.add("kill_switch_engaged");
  if (shotShots.length === 0 || !allShotsStatusReady) reasons.add("shots_not_ready");
  if (!allGatesCovered) reasons.add("incomplete_gate_coverage");
  if (!allC2paValid) reasons.add("incomplete_c2pa_coverage");
  if (blockingUnresolved.length > 0) reasons.add("open_blocking_findings");

  const locked = reasons.size === 0;
  const reason: VerdictReason = locked ? "ok" : worstReason(reasons);

  const inputs: VerdictInputs = {
    snapshot_ref: `vi:${input.scene_id}:${now()}`,
    tau,
    config_version: input.config_version,
    blocking_open: blockingUnresolved.length,
    blocking_finding_ids: blockingUnresolved.map((f) => f.finding_id),
    gate_coverage: {
      required: requiredGateRuns,
      completed: completedGateRuns,
      label: `${completedGateRuns}/${requiredGateRuns}`,
    },
    c2pa_coverage: {
      shots: shotShots.length,
      valid: c2paValidCount,
      label: `${c2paValidCount}/${shotShots.length}`,
    },
    shots_total: shotShots.length,
    shots_gates_complete: shotsReady,
    kill_switch: input.kill_switch ?? false,
    computed_at: now(),
  };

  return {
    scene_id: input.scene_id,
    verdict: locked ? "LOCKED" : "HELD",
    reason,
    inputs,
  };
}
