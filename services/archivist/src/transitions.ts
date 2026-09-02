import { ENTITY_STATE_MACHINES, type EntityType } from "@scenelock/schema";

/**
 * Entity state machines (spec B.2). Transitions are validated but never
 * *blocked* here — the Archivist records candidate observations; the continuity
 * gate turns an illegal/unexpected transition into a Finding (E.5.1). This keeps
 * "failures are findings" (S7) rather than silent rejections.
 */
export type TransitionVerdict =
  | "ok" // legal forward move within the machine
  | "no_op" // from === to
  | "unknown_state" // `to` is not a declared state for this entity type
  | "regression" // moving backward along the linear machine order
  | "skip"; // skipped one or more intermediate states

export function classifyTransition(
  type: EntityType,
  from: string | null,
  to: string,
): TransitionVerdict {
  const order = ENTITY_STATE_MACHINES[type] as readonly string[];
  const ti = order.indexOf(to);
  if (ti === -1) return "unknown_state";
  if (from === null) return "ok";
  if (from === to) return "no_op";
  const fi = order.indexOf(from);
  if (fi === -1) return "unknown_state";
  if (ti < fi) return "regression";
  if (ti - fi > 1) return "skip";
  return "ok";
}

export function isCanonicalCommitAllowed(verdict: TransitionVerdict): boolean {
  return verdict === "ok" || verdict === "no_op";
}
