import { InMemoryEventBus, InMemoryStorage, SeqIdGen, type Clock } from "@scenelock/ports";
import { Archivist } from "@scenelock/archivist";
import { DryRunMediaBackend, MediaProcessor } from "@scenelock/media-processor";
import { GateClearance } from "@scenelock/gate-clearance";
import { GateContinuity } from "@scenelock/gate-continuity";
import { computeBlocking, type ClassScore, type EvasionResult, type RiskClass, type SceneBenchScorecard } from "@scenelock/schema";
import { CORPUS, CORPUS_VERSION, type EvasionCase } from "./corpus.js";

export { CORPUS, CORPUS_VERSION } from "./corpus.js";

/** Per-class catch-rate thresholds and the FP ceiling — a release fails below these (Part G). */
const CATCH_THRESHOLDS: Partial<Record<RiskClass, number>> = {
  lyrics: 0.8,
  trademark: 0.8,
  real_person: 0.9,
  ai_disclosure: 1.0,
  "continuity.state": 0.9,
};
const DEFAULT_CATCH_THRESHOLD = 0.8;
const FP_RATE_THRESHOLD = 0.1;

export interface SaboteurDeps {
  clock: Clock;
  tau?: number;
}

export class Saboteur {
  constructor(private deps: SaboteurDeps) {}

  async run(corpus: EvasionCase[] = CORPUS): Promise<SceneBenchScorecard> {
    const tau = this.deps.tau ?? 0.7;
    const results: EvasionResult[] = [];

    for (const c of corpus) {
      const caught = await this.runCase(c, tau);
      results.push({
        case_id: c.id,
        risk_class: c.risk_class,
        expectation: c.expectation,
        outcome:
          c.expectation === "caught"
            ? caught.raised
              ? "caught"
              : "missed"
            : caught.blocking
              ? "false_positive"
              : "clean",
        detail: c.note,
      });
    }

    const classes = Array.from(new Set(corpus.map((c) => c.risk_class)));
    const by_risk_class: ClassScore[] = classes.map((rc) => {
      const catchCases = results.filter((r) => r.risk_class === rc && r.expectation === "caught");
      const caught = catchCases.filter((r) => r.outcome === "caught").length;
      const rate = catchCases.length ? caught / catchCases.length : 1;
      const threshold = CATCH_THRESHOLDS[rc] ?? DEFAULT_CATCH_THRESHOLD;
      return { risk_class: rc, cases: catchCases.length, caught, catch_rate: round2(rate), threshold, pass: rate >= threshold };
    });

    const cleanCases = results.filter((r) => r.expectation === "clean");
    const fp = cleanCases.filter((r) => r.outcome === "false_positive").length;
    const fpRate = cleanCases.length ? fp / cleanCases.length : 0;

    return {
      corpus_version: CORPUS_VERSION,
      generated_at: this.deps.clock.now(),
      tau,
      total_cases: corpus.length,
      fp_rate_at_tau: round2(fpRate),
      fp_rate_threshold: FP_RATE_THRESHOLD,
      by_risk_class,
      results,
      release_ok: by_risk_class.every((c) => c.pass) && fpRate <= FP_RATE_THRESHOLD,
    };
  }

  private async runCase(c: EvasionCase, tau: number): Promise<{ raised: boolean; blocking: boolean }> {
    const clock = this.deps.clock;
    const storage = new InMemoryStorage();
    await storage.reset();
    const events = new InMemoryEventBus(() => clock.now());
    const ids = new SeqIdGen();
    const archivist = new Archivist({ storage, clock, ids, events });
    const mp = new MediaProcessor({ storage, clock, events, backend: new DryRunMediaBackend(() => clock.now()) });

    await mp.process(c.shot_id);
    await c.apply(storage);

    const findings =
      c.gate === "clearance"
        ? (await new GateClearance({ storage, clock, events }).runShot(c.shot_id)).findings
        : (await new GateContinuity({ storage, clock, archivist, events }).runShot(c.shot_id)).findings;

    const hits = findings.filter((f) => f.risk_class === c.risk_class);
    return { raised: hits.length > 0, blocking: hits.some((f) => computeBlocking(f, tau)) };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
