import type { Clock, EventBusPort, IdGen, StoragePort } from "@scenelock/ports";
import {
  ENTITY_STATE_MACHINES,
  isKnownState,
  type Entity,
  type EntityType,
  type StateEvent,
} from "@scenelock/schema";
import { classifyTransition, type TransitionVerdict } from "./transitions.js";

export { classifyTransition } from "./transitions.js";
export type { TransitionVerdict } from "./transitions.js";

export interface ArchivistDeps {
  storage: StoragePort;
  clock: Clock;
  ids: IdGen;
  events?: EventBusPort;
}

export interface RegisterPlannedInput {
  production_id: string;
  entity_id?: string;
  type: EntityType;
  canonical_desc: string;
  expected_state: string;
  scene: string;
  shot?: string | null;
  reference_uris?: string[];
  embedding_model_version?: string | null;
  facts?: string[];
}

export interface ObserveInput {
  entity_id: string;
  observed_state: string;
  scene: string;
  shot: string | null;
  actor: string; // e.g. "gate-continuity"
  evidence_uri?: string | null;
  facts?: string[];
}

export interface WorldStateQuery {
  scene?: string;
  state?: string; // filter by current_state
  status?: Entity["status"];
  text?: string; // substring over canonical_desc / facts
}

export interface WorldStateFact {
  entity_id: string;
  type: EntityType;
  canonical_desc: string;
  current_state: string | null;
  /** true once committed on LOCK (B.2); false = candidate observation. */
  canonical: boolean;
  facts: string[];
  embedding_model_version: string | null;
}

/**
 * The Archivist (spec §4, E.1). Owns World State: the ledger the gates check
 * against. Built before the gates (spec §15, critical path).
 */
export class Archivist {
  constructor(private deps: ArchivistDeps) {}

  /** Pre-flight planner: register an expected entity/state as `planned` (E.5.0 step 4). */
  async registerPlannedEntity(input: RegisterPlannedInput): Promise<Entity> {
    const id = input.entity_id ?? this.deps.ids.next("ent");
    const ts = this.deps.clock.now();

    if (!isKnownState(input.type, input.expected_state)) {
      // planner asked for a state the machine doesn't define — surface, don't crash
      throw new Error(
        `unknown expected_state "${input.expected_state}" for ${input.type} ` +
          `(allowed: ${ENTITY_STATE_MACHINES[input.type].join(", ")})`,
      );
    }

    const existing = await this.deps.storage.getEntity(id);
    const entity: Entity = {
      entity_id: id,
      project_id: input.production_id,
      type: input.type,
      canonical_desc: input.canonical_desc,
      reference_uris: input.reference_uris ?? existing?.reference_uris ?? [],
      embedding_ref: existing?.embedding_ref ?? null,
      embedding_model_version:
        input.embedding_model_version ?? existing?.embedding_model_version ?? null,
      current_state: input.expected_state,
      state_history: [
        ...(existing?.state_history ?? []),
        { scene: input.scene, shot: input.shot ?? null, state: input.expected_state, evidence_uri: null, ts },
      ],
      facts: input.facts ?? existing?.facts ?? [],
      status: "planned",
    };
    await this.deps.storage.putEntity(entity);

    await this.appendEvent({
      entity_id: id,
      from: existing?.current_state ?? null,
      to: input.expected_state,
      scene: input.scene,
      shot: input.shot ?? null,
      evidence_uri: null,
      actor: "planner",
      canonical: false,
      ts,
    });
    return entity;
  }

  /**
   * Record a gate's observed state as a *candidate* (E.5.1). Returns the
   * transition classification so the continuity gate can raise a Finding.
   * Never rejects — "failures are findings" (S7).
   */
  async recordObservedState(
    input: ObserveInput,
  ): Promise<{ event: StateEvent; verdict: TransitionVerdict; entity: Entity }> {
    const entity = await this.deps.storage.getEntity(input.entity_id);
    if (!entity) throw new Error(`unknown entity ${input.entity_id}`);

    const verdict = classifyTransition(entity.type, entity.current_state, input.observed_state);
    const ts = this.deps.clock.now();

    const event: StateEvent = {
      entity_id: input.entity_id,
      from: entity.current_state,
      to: input.observed_state,
      scene: input.scene,
      shot: input.shot,
      evidence_uri: input.evidence_uri ?? null,
      actor: input.actor,
      canonical: false, // candidate until LOCK
      ts,
    };
    await this.appendEvent(event);

    const updated: Entity = {
      ...entity,
      current_state: input.observed_state,
      status: entity.status === "planned" ? "active" : entity.status,
      facts: input.facts ? Array.from(new Set([...entity.facts, ...input.facts])) : entity.facts,
      state_history: [
        ...entity.state_history,
        { scene: input.scene, shot: input.shot, state: input.observed_state, evidence_uri: input.evidence_uri ?? null, ts },
      ],
    };
    await this.deps.storage.putEntity(updated);
    return { event, verdict, entity: updated };
  }

  /**
   * Commit canonical final states on scene LOCK (B.2). Marks the latest candidate
   * state_event per entity canonical and freezes entity.current_state.
   */
  async commitCanonical(
    sceneId: string,
    productionId: string,
  ): Promise<{ committed: number; entities: string[] }> {
    const entities = await this.deps.storage.listEntities(productionId);
    const events = await this.deps.storage.listStateEvents();
    const touched: string[] = [];

    for (const entity of entities) {
      const last = [...events]
        .filter((e) => e.entity_id === entity.entity_id && e.scene === sceneId)
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .at(-1);
      if (!last) continue;

      await this.appendEvent({
        entity_id: entity.entity_id,
        from: last.to,
        to: last.to,
        scene: sceneId,
        shot: last.shot,
        evidence_uri: last.evidence_uri,
        actor: "archivist",
        canonical: true, // canonical commit
        ts: this.deps.clock.now(),
      });
      await this.deps.storage.putEntity({
        ...entity,
        current_state: last.to,
        status: entity.status === "planned" ? "active" : entity.status,
      });
      touched.push(entity.entity_id);
    }
    return { committed: touched.length, entities: touched };
  }

  /** query_world_state for gates + planner + MCP (F.3). */
  async queryWorldState(
    productionId: string,
    q: WorldStateQuery = {},
  ): Promise<WorldStateFact[]> {
    const entities = await this.deps.storage.listEntities(productionId);
    const events = await this.deps.storage.listStateEvents();
    const canonicalByEntity = new Map<string, boolean>();
    for (const e of events) if (e.canonical) canonicalByEntity.set(e.entity_id, true);

    return entities
      .filter((e) => {
        if (q.status && e.status !== q.status) return false;
        if (q.state && e.current_state !== q.state) return false;
        if (q.scene && !e.state_history.some((h) => h.scene === q.scene)) return false;
        if (q.text) {
          const hay = (e.canonical_desc + " " + e.facts.join(" ")).toLowerCase();
          if (!hay.includes(q.text.toLowerCase())) return false;
        }
        return true;
      })
      .map((e) => ({
        entity_id: e.entity_id,
        type: e.type,
        canonical_desc: e.canonical_desc,
        current_state: e.current_state,
        canonical: canonicalByEntity.get(e.entity_id) ?? false,
        facts: e.facts,
        embedding_model_version: e.embedding_model_version,
      }));
  }

  /** The expected state for an entity in a given scene — the "ledger" a gate checks (H.1 P1 exit). */
  async expectedState(entityId: string, scene: string): Promise<string | null> {
    const events = await this.deps.storage.listStateEvents(entityId);
    const planned = events
      .filter((e) => e.scene === scene && e.actor === "planner")
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .at(-1);
    if (planned) return planned.to;
    const entity = await this.deps.storage.getEntity(entityId);
    return entity?.current_state ?? null;
  }

  async timeline(entityId: string): Promise<StateEvent[]> {
    return this.deps.storage.listStateEvents(entityId);
  }

  /**
   * Re-anchor job (spec G-09). On an embedding-model upgrade, repin every entity
   * anchor to the new version and log it. Gates that still pin the old version
   * will see a mismatch and raise an infra finding on their next run.
   */
  async reanchor(
    productionId: string,
    newModelVersion: string,
  ): Promise<{ repinned: string[]; unchanged: number }> {
    const entities = await this.deps.storage.listEntities(productionId);
    const repinned: string[] = [];
    for (const e of entities) {
      if (e.embedding_model_version === newModelVersion) continue;
      await this.deps.storage.putEntity({ ...e, embedding_model_version: newModelVersion });
      await this.appendEvent({
        entity_id: e.entity_id,
        from: e.current_state,
        to: e.current_state ?? "identity_locked",
        scene: e.state_history.at(-1)?.scene ?? "",
        shot: null,
        evidence_uri: null,
        actor: "reanchor",
        canonical: false,
        ts: this.deps.clock.now(),
      });
      repinned.push(e.entity_id);
    }
    return { repinned, unchanged: entities.length - repinned.length };
  }

  private async appendEvent(ev: StateEvent): Promise<void> {
    await this.deps.storage.appendStateEvent(ev);
    await this.deps.events?.publish("kg.events", ev, { ordering_key: ev.entity_id });
    this.deps.events?.emitSse({
      type: "worldstate.updated",
      data: { entityId: ev.entity_id, event: { from: ev.from, to: ev.to, scene: ev.scene, canonical: ev.canonical } },
    });
  }
}
