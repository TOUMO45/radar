/**
 * P0 exit-criterion probe: compute the verdict on the DRY_RUN seed and print it.
 * `pnpm seed:verdict` from the repo root.
 */
import { getDryRunStore } from "@scenelock/fixtures";
import { computeVerdict, isBlocking } from "@scenelock/verdict";

const s = getDryRunStore();
const verdict = computeVerdict({
  scene_id: s.scene.scene_id,
  tau: s.production.settings.tau,
  config_version: s.production.settings.config_version,
  kill_switch: s.production.kill_switch,
  shots: s.shots,
  findings: s.findings,
});

const blocking = s.findings.filter((f) => isBlocking(f, s.production.settings.tau));

console.log("── Radar DRY_RUN verdict ─────────────────────────────");
console.log(`production : ${s.production.title} (${s.production.mode})`);
console.log(`scene      : ${s.scene.scene_id}  "${s.scene.heading}"`);
console.log(`τ          : ${s.production.settings.tau}`);
console.log(`verdict    : ${verdict.verdict}  (${verdict.reason})`);
console.log(`shots      : ${verdict.inputs.shots_gates_complete}/${verdict.inputs.shots_total} gates complete`);
console.log(`gate cov   : ${verdict.inputs.gate_coverage.label}`);
console.log(`C2PA cov   : ${verdict.inputs.c2pa_coverage.label}`);
console.log(`blocking   : ${verdict.inputs.blocking_open}  [${verdict.inputs.blocking_finding_ids.join(", ")}]`);
console.log("");
console.log("findings:");
for (const f of s.findings) {
  const b = isBlocking(f, s.production.settings.tau) ? "BLOCKING" : "        ";
  console.log(
    `  ${b}  ${f.finding_id.padEnd(20)} ${f.severity.padEnd(6)} conf ${f.confidence.toFixed(2)}  ${f.risk_class} (${f.stage})`,
  );
}
console.log("─────────────────────────────────────────────────────────");

if (verdict.verdict !== "HELD" || verdict.inputs.blocking_open !== 3) {
  console.error("\n✗ expected HELD with 3 blocking findings");
  process.exit(1);
}
console.log("\n✓ P0 exit criterion met: DRY_RUN end-to-end verdict on seeded scene");
