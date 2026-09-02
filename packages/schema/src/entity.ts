import { z } from "zod";
import { GcsUri, Timestamp } from "./primitives.js";

/**
 * World State entity record (spec §4, Appendix B) + entity state machines (B.2).
 * World State is built FIRST; gates check against it (spec §15, critical path).
 */

export const EntityType = z.enum(["prop", "wardrobe", "character", "location"]);
export type EntityType = z.infer<typeof EntityType>;

export const EntityStatus = z.enum(["active", "removed", "retired", "planned"]);
export type EntityStatus = z.infer<typeof EntityStatus>;

/** Canonical per-type state machines (B.2 "Entity state machines"). */
export const ENTITY_STATE_MACHINES = {
  prop: ["introduced", "on_screen", "moved", "removed"],
  wardrobe: ["worn", "altered", "changed_outfit", "removed"],
  character: ["identity_locked", "variant_flagged"],
  location: ["established", "redressed"],
} as const satisfies Record<EntityType, readonly string[]>;

export type EntityState =
  (typeof ENTITY_STATE_MACHINES)[EntityType][number];

/** state_events are immutable (B.2). */
export const StateEvent = z.object({
  event_id: z.string().min(1).optional(),
  entity_id: z.string().min(1),
  from: z.string().nullable(),
  to: z.string().min(1),
  scene: z.string().min(1),
  shot: z.string().min(1).nullable(),
  evidence_uri: GcsUri.nullable(),
  actor: z.string().min(1),
  /** candidate until the scene LOCKs, then Archivist commits canonical (B.2). */
  canonical: z.boolean().default(false),
  ts: Timestamp,
});
export type StateEvent = z.infer<typeof StateEvent>;

export const Entity = z
  .object({
    entity_id: z.string().min(1),
    project_id: z.string().min(1),
    type: EntityType,
    canonical_desc: z.string(),
    reference_uris: z.array(GcsUri).default([]),
    embedding_ref: z.string().nullable().default(null),
    /** anchors carry the model version; gates pin it (G-09). */
    embedding_model_version: z.string().nullable().default(null),
    current_state: z.string().nullable().default(null),
    state_history: z
      .array(
        z.object({
          scene: z.string().min(1),
          shot: z.string().min(1).nullable(),
          state: z.string().min(1),
          evidence_uri: GcsUri.nullable(),
          ts: Timestamp,
        }),
      )
      .default([]),
    facts: z.array(z.string()).default([]),
    status: EntityStatus.default("active"),
  })
  .strict();

export type Entity = z.infer<typeof Entity>;

/** Is `to` a legal successor state for this entity type? (loose: any declared state is accepted) */
export function isKnownState(type: EntityType, state: string): boolean {
  return (ENTITY_STATE_MACHINES[type] as readonly string[]).includes(state);
}
