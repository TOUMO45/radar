import { z } from "zod";
import { GcsUri, Timestamp } from "./primitives.js";

/**
 * Consent Registry (spec G-03, E.7, C.2 S8). PII — CMEK, access-logged (E.10).
 * The real_person clearance check does: matched public figure ∧ no *active*
 * consent record → finding (E.5.2).
 */
export const ConsentKind = z.enum(["release", "licensing", "location"]);
export type ConsentKind = z.infer<typeof ConsentKind>;

export const ConsentStatus = z.enum(["draft", "active", "expired"]);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const ConsentRecord = z
  .object({
    record_id: z.string().min(1),
    production_id: z.string().min(1),
    subject: z.string().min(1),
    kind: ConsentKind,
    linked_entity_id: z.string().nullable().default(null),
    linked_figure_node_id: z.string().nullable().default(null),
    doc_uri: GcsUri.nullable().default(null),
    expiry: Timestamp.nullable().default(null),
    status: ConsentStatus,
    redaction_status: z.enum(["pending", "clean", "flagged"]).default("pending"),
    uploaded_by: z.string().min(1),
    created_at: Timestamp,
  })
  .strict();
export type ConsentRecord = z.infer<typeof ConsentRecord>;

/** true iff a record actively covers `subject` right now. */
export function hasActiveConsent(
  records: ConsentRecord[],
  subject: string,
  now: string,
): boolean {
  const s = subject.trim().toLowerCase();
  return records.some(
    (r) =>
      r.status === "active" &&
      r.subject.trim().toLowerCase() === s &&
      (r.expiry === null || r.expiry > now),
  );
}
