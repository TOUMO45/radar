/**
 * @scenelock/fixtures — the DRY_RUN demo spine (D11).
 * `getDryRunStore()` returns a fresh deep copy so consumers can mutate freely.
 */
import type {
  ApiToken,
  Attempt,
  ComplianceProfile,
  ConsentRecord,
  Directive,
  Entity,
  Finding,
  KgNode,
  Production,
  Scene,
  Shot,
  ShotContinuity,
  ShotProvenance,
  ShotText,
  StateEvent,
} from "@scenelock/schema";
import * as seed from "./dry-run.js";
import * as kgSeed from "./kg.js";
import * as tokenSeed from "./tokens.js";
import { continuity as continuitySeed } from "./continuity.js";
import { provenance as provenanceSeed, complianceProfile as complianceProfileSeed } from "./provenance.js";

export { ORG_ID, PRODUCTION_ID, SCENE_ID } from "./dry-run.js";

export interface DryRunStore {
  production: Production;
  scene: Scene;
  shots: Shot[];
  findings: Finding[];
  entities: Entity[];
  stateEvents: StateEvent[];
  directives: Directive[];
  attempts: Attempt[];
  kg: KgNode[];
  consentRecords: ConsentRecord[];
  dialogue: Record<string, ShotText>;
  apiTokens: ApiToken[];
  continuity: Record<string, ShotContinuity>;
  provenance: Record<string, ShotProvenance>;
  complianceProfile: ComplianceProfile;
}

/** Fixtures are plain JSON-safe data, so a JSON round-trip is a sufficient deep copy. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function getDryRunStore(): DryRunStore {
  return clone({
    production: seed.production,
    scene: seed.scene,
    shots: seed.shots,
    findings: seed.findings,
    entities: seed.entities,
    stateEvents: seed.stateEvents,
    directives: seed.directives,
    attempts: seed.attempts,
    kg: kgSeed.kg,
    consentRecords: kgSeed.consentRecords,
    dialogue: kgSeed.dialogue,
    apiTokens: tokenSeed.apiTokens,
    continuity: continuitySeed,
    provenance: provenanceSeed,
    complianceProfile: complianceProfileSeed,
  });
}

export { DEMO_MCP_TOKEN } from "./tokens.js";
export const dryRun = { ...seed, ...kgSeed, ...tokenSeed };
