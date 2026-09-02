import type { ShotContinuity } from "@scenelock/schema";

/**
 * Per-shot continuity plan + observations (spec E.5.1), DRY_RUN edition.
 * Reproduces the Act-1 continuity beats:
 *   - shot 3: the cola can has moved (state), the blazer is gone (presence)
 *   - shot 5: Riya's identity embedding drifts just below T_id
 * Everything else matches the plan.
 */
const T_ID = 0.82;
const EV = "gemini-embed-001@2026-03";

const CLEAN = (shotId: string): ShotContinuity => ({
  shot_id: shotId,
  expected: {
    "SC12-PROP-CAN-01": "on_screen(right_of_laptop)",
    "SC12-WARD-JACKET-01": "worn(on_chair_back)",
    "SC12-CHAR-RIYA-01": "identity_locked",
    "SC12-LOC-BULLPEN-01": "established",
  },
  observed: [
    { entity_id: "SC12-PROP-CAN-01", present: true, observed_state: "on_screen(right_of_laptop)", identity_cosine: null },
    { entity_id: "SC12-WARD-JACKET-01", present: true, observed_state: "worn(on_chair_back)", identity_cosine: null },
    { entity_id: "SC12-CHAR-RIYA-01", present: true, observed_state: "identity_locked", identity_cosine: 0.94 },
    { entity_id: "SC12-LOC-BULLPEN-01", present: true, observed_state: "established", identity_cosine: null },
  ],
  unexpected: [],
  identity_threshold: T_ID,
  embedding_model_version: EV,
});

export const continuity: Record<string, ShotContinuity> = {
  shot_1: CLEAN("shot_1"),
  shot_2: CLEAN("shot_2"),
  shot_3: {
    ...CLEAN("shot_3"),
    observed: [
      { entity_id: "SC12-PROP-CAN-01", present: true, observed_state: "on_screen(left_of_laptop)", identity_cosine: null },
      { entity_id: "SC12-WARD-JACKET-01", present: false, observed_state: null, identity_cosine: null },
      { entity_id: "SC12-CHAR-RIYA-01", present: true, observed_state: "identity_locked", identity_cosine: 0.93 },
      { entity_id: "SC12-LOC-BULLPEN-01", present: true, observed_state: "established", identity_cosine: null },
    ],
  },
  shot_4: CLEAN("shot_4"),
  shot_5: {
    ...CLEAN("shot_5"),
    observed: [
      { entity_id: "SC12-PROP-CAN-01", present: true, observed_state: "on_screen(right_of_laptop)", identity_cosine: null },
      { entity_id: "SC12-WARD-JACKET-01", present: true, observed_state: "worn(on_chair_back)", identity_cosine: null },
      { entity_id: "SC12-CHAR-RIYA-01", present: true, observed_state: "identity_locked", identity_cosine: 0.79 },
      { entity_id: "SC12-LOC-BULLPEN-01", present: true, observed_state: "established", identity_cosine: null },
    ],
  },
  shot_6: {
    ...CLEAN("shot_6"),
    // wide on an empty room — the prop/wardrobe/character aren't expected here
    expected: { "SC12-LOC-BULLPEN-01": "established" },
    observed: [
      { entity_id: "SC12-LOC-BULLPEN-01", present: true, observed_state: "established", identity_cosine: null },
    ],
  },
};
