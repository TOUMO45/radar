import type { Clock, IdGen, StoragePort } from "@scenelock/ports";
import type { Archivist } from "@scenelock/archivist";
import type { Directive, Finding } from "@scenelock/schema";

/**
 * Directive compiler (spec E.1, E.3, Appendix C). Prompt patch + reference images
 * from World State + invariants + acceptance criteria. Invariants travel with the
 * directive and are re-verified after regeneration (R2).
 */
export interface CompilerDeps {
  storage: StoragePort;
  archivist: Archivist;
  clock: Clock;
  ids: IdGen;
}

const GENERIC_INVARIANTS = [
  "camera framing and lens unchanged",
  "lighting and colour grade unchanged",
  "no entity added or removed beyond the directed change",
];

export async function compileDirective(
  deps: CompilerDeps,
  finding: Finding,
  opts: { manual?: boolean } = {},
): Promise<Directive> {
  const shotId = finding.shot_id ?? "";
  const scene = await deps.storage.getScene(finding.scene_id);
  const productionId = scene?.production_id ?? "";

  // reference images: the targeted entity's anchors, plus every other active
  // entity in the scene so the regen holds them steady.
  const refUris: string[] = [];
  const facts: string[] = [];
  if (finding.entity_id) {
    const e = await deps.storage.getEntity(finding.entity_id);
    if (e) {
      refUris.push(...e.reference_uris);
      facts.push(`${e.entity_id}: ${e.canonical_desc}`);
    }
  }
  const worldFacts = await deps.archivist.queryWorldState(productionId, { scene: finding.scene_id });
  const invariantEntities = worldFacts
    .filter((f) => f.entity_id !== finding.entity_id)
    .map((f) => `${describe(f.type)} "${f.canonical_desc}" stays exactly as established`);

  const promptPatch =
    finding.recommendation ||
    `Regenerate ${shotId} so that ${finding.risk_class} (${finding.rule}) no longer holds.`;

  return {
    directive_id: deps.ids.next("dir"),
    target_finding_id: finding.finding_id,
    shot_id: shotId,
    prompt_patch: promptPatch,
    reference_images: refUris,
    invariants: [...invariantEntities, ...GENERIC_INVARIANTS],
    acceptance_criteria: [
      `${finding.risk_class}(${finding.finding_id}) resolves`,
      "no new blocking findings on re-run of both gates",
      `c2pa.valid = true for regenerated ${shotId}`,
      ...facts.map((f) => `world state holds: ${f}`),
    ],
    attempt_budget: 2,
    manual: opts.manual ?? false,
    created_at: deps.clock.now(),
  };
}

function describe(t: string): string {
  return t === "wardrobe" ? "wardrobe item" : t;
}
