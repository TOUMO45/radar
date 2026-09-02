import { z } from "zod";
import { Finding } from "./finding.js";
import { SceneVerdict } from "./scene.js";
import { ShotStatus } from "./shot.js";

/**
 * SSE event catalog (D.4). Channel: /api/stream/productions/:pid.
 * One-way push; client reconnects with Last-Event-ID (D10).
 */

export const SseEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("finding.created"), data: Finding }),
  z.object({
    type: z.literal("finding.updated"),
    data: z.object({ findingId: z.string(), patch: z.record(z.string(), z.unknown()) }),
  }),
  z.object({
    type: z.literal("shot.status"),
    data: z.object({
      shotId: z.string(),
      status: ShotStatus,
      attempt: z.number().int().optional(),
    }),
  }),
  z.object({
    type: z.literal("loop.attempt"),
    data: z.object({
      attemptId: z.string(),
      state: z.string(),
      n: z.number().int(),
      cost: z.number().optional(),
    }),
  }),
  z.object({ type: z.literal("verdict.changed"), data: SceneVerdict }),
  z.object({
    type: z.literal("incident.opened"),
    data: z.object({ incidentId: z.string(), findingId: z.string() }),
  }),
  z.object({
    type: z.literal("incident.closed"),
    data: z.object({ incidentId: z.string(), findingId: z.string(), note: z.string().optional() }),
  }),
  z.object({
    type: z.literal("worldstate.updated"),
    data: z.object({ entityId: z.string(), event: z.record(z.string(), z.unknown()) }),
  }),
  z.object({
    type: z.literal("consent.updated"),
    data: z.object({ recordId: z.string(), status: z.string() }),
  }),
  z.object({
    type: z.literal("certificate.signed"),
    data: z.object({ certificateId: z.string(), hash: z.string() }),
  }),
  z.object({
    type: z.literal("system.degraded"),
    data: z.object({ component: z.string(), mode: z.string() }),
  }),
  z.object({
    type: z.literal("cost.updated"),
    data: z.object({ productionId: z.string(), spend: z.number(), cap: z.number() }),
  }),
  z.object({
    type: z.literal("demo.act"),
    data: z.object({ act: z.number().int(), title: z.string(), note: z.string().default("") }),
  }),
]);
export type SseEvent = z.infer<typeof SseEvent>;
export type SseEventType = SseEvent["type"];
