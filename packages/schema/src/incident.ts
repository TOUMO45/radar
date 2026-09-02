import { z } from "zod";
import { Timestamp } from "./primitives.js";

/**
 * Incident (spec C.3 Flow B, E.11, D.4). A blocking finding auto-opens one,
 * auto-assigned to the Fixer; it auto-closes with a resolution note when the
 * finding resolves. Grafana Incidents in production — an in-memory watchdog here
 * (the IncidentsPort is the seam).
 */
export const IncidentStatus = z.enum(["open", "closed"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const Incident = z
  .object({
    incident_id: z.string().min(1),
    production_id: z.string().min(1),
    scene_id: z.string().min(1),
    finding_id: z.string().min(1),
    status: IncidentStatus,
    reason: z.string().min(1),
    assignee: z.string().min(1), // "fixer" | user id | "sre"
    severity: z.enum(["info", "low", "medium", "high"]).default("high"),
    opened_at: Timestamp,
    closed_at: Timestamp.nullable().default(null),
    note: z.string().nullable().default(null),
  })
  .strict();
export type Incident = z.infer<typeof Incident>;
