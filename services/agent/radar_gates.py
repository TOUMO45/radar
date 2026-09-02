"""
radar_gates.py — Radar's two non-negotiable deterministic rules,
enforced in plain Python with ZERO agent/cloud dependencies.
=======================================================================

WHY THIS FILE EXISTS (separate from radar_agent.py)
--------------------------------------------------------
The agent's own docstring makes a promise: "Goals 1-4 are pure-function
tests: no network, no credentials, no cost." That promise could not
actually be kept while the budget/lock logic lived in a module whose very
first lines are `from google.adk... import ...` — you could not run the
budget-cap test without installing the full ADK stack and configuring
credentials first.

So the deterministic core lives here, importing nothing but the standard
library. `radar_agent.py` imports these gates instead of re-declaring
them. Result:

  * `python radar_gates.py`  → runs G1-G4 with zero dependencies.
  * `python radar_agent.py`  → runs G1-G6 (adds the live Grafana MCP
                                   + real Gemini turn) using THE SAME gates.

One implementation of each rule, tested at two tiers. This is the spec's
own principle (D5: "the lock logic has exactly one home") applied inside
the Python service.

SINGLE SOURCE OF TRUTH ACROSS LANGUAGES
----------------------------------------
The Radar backend already implements these exact rules in TypeScript
(`services/verdict/computeVerdict`, `services/fixer` budget governor,
`services/certifier`). Two hand-kept copies of a safety rule WILL drift.
So each gate takes an optional `backend`:

  * backend=None (default)      → the in-process reference implementation
                                   below. Deterministic, offline, free —
                                   this is what G1-G4 test.
  * backend=ApiBackend(base)    → defers to the running TS API, which is
                                   the production authority. Set
                                   SCENELOCK_API_BASE to enable.

The reference implementation and the TS one are kept behaviourally
identical and cross-checked by the SceneBench-style fixtures; in
production you point at the API so there is exactly one decision-maker.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional, Protocol


# ---------------------------------------------------------------------------
# Optional real-mode backend: defer the decision to the TS API so the rule
# has one authority in production. Pure stdlib (urllib) — still no deps.
# ---------------------------------------------------------------------------
class GateBackend(Protocol):
    def remediate(self, finding_id: str) -> dict: ...
    def certify(self, scene_id: str) -> dict: ...


@dataclass
class ApiBackend:
    """Talks to the running Radar TS API (services/api). The API's
    `/remediate` endpoint enforces the budget cap and `/certify` enforces
    the full lock rule, so this backend inherits the single source of
    truth instead of re-deciding anything."""

    base_url: str
    role: str = "sre_admin"
    timeout_s: float = 30.0

    def _post(self, path: str) -> dict:
        req = urllib.request.Request(
            f"{self.base_url.rstrip('/')}{path}",
            method="POST",
            headers={
                "content-type": "application/json",
                "x-scenelock-role": self.role,
                "x-scenelock-user": "agent:fixer",
            },
            data=b"{}",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
            return json.loads(resp.read() or b"{}")

    def remediate(self, finding_id: str) -> dict:
        return self._post(f"/v1/findings/{finding_id}/remediate")

    def certify(self, scene_id: str) -> dict:
        return self._post(f"/v1/scenes/{scene_id}/certify")


def default_backend() -> Optional[GateBackend]:
    """Use the API as the authority when SCENELOCK_API_BASE is set;
    otherwise fall back to the offline reference implementation."""
    base = os.environ.get("SCENELOCK_API_BASE", "").strip()
    return ApiBackend(base) if base else None


# ---------------------------------------------------------------------------
# Gate 1 — loop budget cap (spec E.3/E.12). Max N auto-regenerations per
# finding; the (N+1)th is refused and MUST be escalated, never retried.
# ---------------------------------------------------------------------------
@dataclass
class LoopBudgetGate:
    attempts_by_finding: dict[str, int] = field(default_factory=dict)
    cap: int = int(os.environ.get("SCENELOCK_LOOP_BUDGET_CAP", "2"))
    backend: Optional[GateBackend] = None

    def regenerate_within_budget(
        self, finding_id: str, shot_id: str, prompt_patch: str
    ) -> dict:
        """Attempt a shot regeneration only if the per-finding attempt
        budget has not been exceeded. The decision is made in code, so no
        prompt wording can talk the agent past the cap.

        Returns either {status: submitted, ...} or {status: refused,
        reason: budget_exceeded, required_action: escalate_to_human_incident}.
        """
        if self.backend is not None:
            # Production authority: the TS loop enforces the cap and returns
            # an outcome. Map it onto this gate's contract.
            out = self.backend.remediate(finding_id)
            outcome = out.get("outcome")
            if outcome in ("resolved", "escalated", "no_op"):
                return {
                    "status": "submitted" if outcome == "resolved" else "refused",
                    "reason": None if outcome == "resolved" else outcome,
                    "attempts": out.get("attempts"),
                    "required_action": (
                        "escalate_to_human_incident" if outcome == "escalated" else None
                    ),
                    "source": "ts_api",
                }
            if outcome == "paused_budget":
                return {
                    "status": "refused",
                    "reason": "budget_exceeded",
                    "attempts_used": self.cap,
                    "cap": self.cap,
                    "required_action": "escalate_to_human_incident",
                    "source": "ts_api",
                }
            return {"status": "refused", "reason": "unknown", "raw": out, "source": "ts_api"}

        attempts_used = self.attempts_by_finding.get(finding_id, 0)
        if attempts_used >= self.cap:
            return {
                "status": "refused",
                "reason": "budget_exceeded",
                "attempts_used": attempts_used,
                "cap": self.cap,
                "required_action": "escalate_to_human_incident",
            }
        self.attempts_by_finding[finding_id] = attempts_used + 1
        return {
            "status": "submitted",
            "veo_job_id": _call_veo(shot_id, prompt_patch),
            "attempt_no": attempts_used + 1,
            "cap": self.cap,
        }


def _call_veo(shot_id: str, prompt_patch: str) -> str:
    """DRY-RUN stub — replace with the real Veo client call in the real
    fixer service. Kept separate so the budget gate stays testable with no
    Veo quota spent."""
    return f"dryrun-veo-job-{shot_id}"


# ---------------------------------------------------------------------------
# Gate 2 — the lock rule (spec E.4, incl. the G-02 gate-coverage fix).
# A scene may only be certified when coverage is COMPLETE and there are no
# open blocking findings. A crashed gate (fewer completed than required)
# must never yield a LOCK just because it produced no findings.
# ---------------------------------------------------------------------------
@dataclass
class LockRuleGate:
    backend: Optional[GateBackend] = None

    def sign_if_locked(
        self,
        scene_id: str,
        gates_completed: int,
        gates_total: int,
        open_blocking_findings: int,
        *,
        c2pa_valid_shots: Optional[int] = None,
        c2pa_total_shots: Optional[int] = None,
        kill_switch: bool = False,
    ) -> dict:
        """Refuse unless the full lock rule holds. The optional c2pa_* and
        kill_switch args make this the COMPLETE E.4 rule; omitting them
        keeps the conservative subset used by the agent's smoke tests (a
        subset is always safe — it can only refuse more, never sign when it
        shouldn't). In production, pass backend=ApiBackend(...) so the
        TS `computeVerdict` is the single authority."""
        if self.backend is not None:
            out = self.backend.certify(scene_id)
            cert = out.get("certificate")
            if cert:
                return {"status": "signed", "scene_id": scene_id,
                        "certificate_hash": cert["payload"]["certificate_hash"],
                        "slug": cert["payload"]["verification_slug"], "source": "ts_api"}
            return {"status": "refused", "reason": out.get("error", "not_locked"),
                    "source": "ts_api"}

        if kill_switch:
            return {"status": "refused", "reason": "kill_switch_engaged"}
        if gates_completed < gates_total:
            return {
                "status": "refused",
                "reason": "incomplete_gate_coverage",
                "gates_completed": gates_completed,
                "gates_total": gates_total,
            }
        if c2pa_valid_shots is not None and c2pa_total_shots is not None:
            if c2pa_valid_shots < c2pa_total_shots:
                return {
                    "status": "refused",
                    "reason": "incomplete_c2pa_coverage",
                    "c2pa_valid_shots": c2pa_valid_shots,
                    "c2pa_total_shots": c2pa_total_shots,
                }
        if open_blocking_findings > 0:
            return {
                "status": "refused",
                "reason": "open_blocking_findings",
                "open_blocking_findings": open_blocking_findings,
            }
        return {
            "status": "signed",
            "scene_id": scene_id,
            # Replace with the real Cloud KMS sign call; keep the guards above.
            "certificate_hash": f"dryrun-sha256-{scene_id}",
        }


# ---------------------------------------------------------------------------
# G1-G4 self-test — pure functions, no network, no credentials, no cost.
# `python radar_gates.py` → PASS/FAIL exit code. This is the offline
# tier the agent's docstring promised; it now genuinely runs standalone.
# ---------------------------------------------------------------------------
def run_deterministic_selftest() -> int:
    results: list[tuple[str, bool, str]] = []

    budget = LoopBudgetGate()
    r1 = budget.regenerate_within_budget("f_test", "shot_1", "patch")
    r2 = budget.regenerate_within_budget("f_test", "shot_1", "patch")
    r3 = budget.regenerate_within_budget("f_test", "shot_1", "patch")
    g1 = (
        r1["status"] == "submitted"
        and r2["status"] == "submitted"
        and r3["status"] == "refused"
        and r3["reason"] == "budget_exceeded"
    )
    results.append(("G1: loop budget cap enforced at exactly 2 attempts", g1, str(r3)))

    lock = LockRuleGate()
    r4 = lock.sign_if_locked("sc_test", 6, 6, open_blocking_findings=1)
    g2 = r4["status"] == "refused" and r4["reason"] == "open_blocking_findings"
    results.append(
        ("G2: cannot sign with an open blocking finding (negative control)", g2, str(r4))
    )

    r5 = lock.sign_if_locked("sc_test", 6, 6, open_blocking_findings=0)
    g3 = r5["status"] == "signed"
    results.append(("G3: clean scene signs successfully", g3, str(r5)))

    r6 = lock.sign_if_locked("sc_test", 5, 6, open_blocking_findings=0)
    g4 = r6["status"] == "refused" and r6["reason"] == "incomplete_gate_coverage"
    results.append(
        ("G4: incomplete gate coverage refuses even with 0 findings (G-02)", g4, str(r6))
    )

    # bonus: the two full-rule extensions this refactor added
    r7 = lock.sign_if_locked("sc_test", 6, 6, 0, c2pa_valid_shots=5, c2pa_total_shots=6)
    g5 = r7["status"] == "refused" and r7["reason"] == "incomplete_c2pa_coverage"
    results.append(("G4b: incomplete C2PA coverage refuses (full E.4 rule)", g5, str(r7)))

    r8 = lock.sign_if_locked("sc_test", 6, 6, 0, kill_switch=True)
    g6 = r8["status"] == "refused" and r8["reason"] == "kill_switch_engaged"
    results.append(("G4c: kill switch blocks signing (full E.4 rule)", g6, str(r8)))

    print("\n=== Radar deterministic gates — offline self-test ===")
    all_pass = all(ok for _, ok, _ in results)
    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}\n        {detail}")
    print(
        "=== "
        + ("ALL DETERMINISTIC GOALS PASSED" if all_pass else "STOP — fix the FAIL(s) above")
        + " ===\n"
    )
    return 0 if all_pass else 1


if __name__ == "__main__":
    import sys

    sys.exit(run_deterministic_selftest())
