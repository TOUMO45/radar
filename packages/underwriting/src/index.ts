import type {
  Certificate,
  ComplianceProfile,
  ConsentLedgerEntry,
  ConsentRecord,
  DeliveryReadiness,
  Finding,
  FindingLedgerEntry,
  Production,
  ShotDisclosure,
  ShotProvenance,
  TrustScore,
  UnderwritingCheck,
  UnderwritingPack,
} from "@scenelock/schema";
import { hasActiveConsent } from "@scenelock/schema";

/**
 * The E&O / Underwriting Pack assembler (roadmap R1).
 *
 * Pure and deterministic (S1): it re-projects data Radar already holds —
 * provenance, consent, findings + waiver trail, the signed certificate, trust and
 * delivery readiness — into the single binder an underwriter reads before binding
 * AI-content coverage. No new judgement, no model, no keys.
 */

export const UNDERWRITING_DISCLAIMER =
  "Radar is a compliance radar, not a lawyer or an insurer. This pack documents what " +
  "the production's own records show against public obligations and distributor " +
  "requirements as of the generation date. A licensed underwriter and counsel decide " +
  "whether to bind coverage. Not legal or insurance advice.";

/** Real/replica people whose likeness needs a consent record on file. */
const CONSENT_REQUIRED_KINDS = new Set([
  "living_performer",
  "deceased_performer",
  "real_public_figure",
]);

const CLEARANCE_RISK_CLASSES = new Set(["trademark", "lyrics", "real_person", "ai_disclosure"]);
const COMPLIANCE_RISK_CLASSES = new Set([
  "synthetic_media_disclosure",
  "deepfake_disclosure",
  "likeness_rights",
  "watermark_missing",
  "platform_policy",
]);

const isOpen = (f: Finding) =>
  f.status === "open" || f.status === "in_remediation" || f.status === "escalated";

export interface UnderwritingInput {
  scene_id: string;
  production: Production;
  profile: ComplianceProfile;
  provenance: ShotProvenance[];
  consentRecords: ConsentRecord[];
  /** clearance + compliance findings for the scene, `blocking` precomputed. */
  findings: Finding[];
  trust: TrustScore;
  delivery: DeliveryReadiness;
  certificate: Certificate | null;
  /** public verify route prefix, e.g. "/verify". */
  verify_prefix?: string;
  pack_id: string;
  now: string;
}

function shotDisclosure(p: ShotProvenance, consentOnFile: (s: string | null) => boolean): ShotDisclosure {
  const c2pa_present = p.c2pa?.present === true;
  const c2pa_valid = p.c2pa?.valid === true;
  const watermark_detectable = p.watermark.present && p.watermark.detectable;
  const disclosed = c2pa_valid || watermark_detectable || p.perceptible_label.present;

  const consent_required = CONSENT_REQUIRED_KINDS.has(p.replica_kind);
  const consent_on_file =
    !!p.consent_record_id || (consent_required && consentOnFile(p.subject_name));

  const gaps: string[] = [];
  if (p.is_ai_generated && !disclosed)
    gaps.push("no AI disclosure (needs valid C2PA, a detectable watermark, or a perceptible label)");
  if (p.is_deepfake && !p.perceptible_label.present)
    gaps.push("deepfake of a real person without a perceptible on-screen label (EU AI Act Art. 50(4))");
  if (consent_required && !consent_on_file)
    gaps.push(`digital replica (${p.replica_kind}) without a consent record on file`);

  return {
    shot_id: p.shot_id,
    is_ai_generated: p.is_ai_generated,
    generator: p.generator,
    is_deepfake: p.is_deepfake,
    replica_kind: p.replica_kind,
    subject_name: p.subject_name,
    c2pa_present,
    c2pa_valid,
    watermark_method: p.watermark.method,
    watermark_detectable,
    perceptible_label: p.perceptible_label.present,
    consent_required,
    consent_record_id: p.consent_record_id,
    consent_on_file,
    documented: (!p.is_ai_generated || disclosed) && (!consent_required || consent_on_file),
    gaps,
  };
}

function findingLedger(findings: Finding[]): FindingLedgerEntry[] {
  return findings
    .filter((f) => CLEARANCE_RISK_CLASSES.has(f.risk_class) || COMPLIANCE_RISK_CLASSES.has(f.risk_class))
    .map((f) => {
      let disposition: string | null = null;
      if (f.status === "waived" && f.adjudication)
        disposition = `waived by ${f.adjudication.by}: "${f.adjudication.reason}"`;
      else if (f.status === "resolved")
        disposition = f.remediation?.directive_id
          ? `resolved via remediation ${f.remediation.directive_id}`
          : "resolved";
      return {
        finding_id: f.finding_id,
        shot_id: f.shot_id,
        risk_class: f.risk_class,
        severity: f.severity,
        blocking: f.blocking,
        status: f.status,
        description: f.description,
        disposition,
      };
    });
}

/** Assemble the pack from already-fetched data. Deterministic. */
export function assembleUnderwritingPack(input: UnderwritingInput): UnderwritingPack {
  const consentOnFile = (subject: string | null) =>
    subject !== null && hasActiveConsent(input.consentRecords, subject, input.now);

  const shot_disclosures = input.provenance.map((p) => shotDisclosure(p, consentOnFile));
  const findings_ledger = findingLedger(input.findings);

  const consent_ledger: ConsentLedgerEntry[] = input.consentRecords.map((r) => ({
    record_id: r.record_id,
    subject: r.subject,
    kind: r.kind,
    status: r.status,
    expiry: r.expiry,
    doc_uri: r.doc_uri,
    linked_entity_id: r.linked_entity_id,
  }));

  // --- the underwriter's binder checklist ---------------------------------
  const aiShots = shot_disclosures.filter((s) => s.is_ai_generated);
  const undisclosed = aiShots.filter((s) => s.gaps.some((g) => g.startsWith("no AI disclosure")));
  const missingConsent = shot_disclosures.filter((s) => s.consent_required && !s.consent_on_file);
  const deepfakeUnlabelled = shot_disclosures.filter(
    (s) => s.is_deepfake && !s.perceptible_label,
  );
  const withC2pa = aiShots.filter((s) => s.c2pa_valid);
  const openBlocking = input.findings.filter((f) => isOpen(f) && f.blocking);
  const cert = input.certificate;

  const checklist: UnderwritingCheck[] = [
    {
      id: "ai_disclosure_per_shot",
      requirement: "Every AI-generated shot carries a documented AI disclosure",
      basis: "EU AI Act Art. 50(2); 2026 E&O AI-content documentation requirement",
      status: aiShots.length === 0 ? "na" : undisclosed.length === 0 ? "pass" : "fail",
      blocks_binding: true,
      detail:
        aiShots.length === 0
          ? "no AI-generated shots in this scene"
          : `${aiShots.length - undisclosed.length}/${aiShots.length} AI shots disclosed` +
            (undisclosed.length ? ` — missing: ${undisclosed.map((s) => s.shot_id).join(", ")}` : ""),
    },
    {
      id: "deepfake_perceptible_label",
      requirement: "Every deepfake of a real person carries a perceptible on-screen label",
      basis: "EU AI Act Art. 50(4)",
      status: deepfakeUnlabelled.length === 0 ? "pass" : "fail",
      blocks_binding: true,
      detail:
        deepfakeUnlabelled.length === 0
          ? "all real-person deepfakes labelled (or none present)"
          : `unlabelled: ${deepfakeUnlabelled.map((s) => s.shot_id).join(", ")}`,
    },
    {
      id: "digital_replica_consent",
      requirement: "Every digital replica of a living/deceased/real person has a consent record",
      basis: "CA AB 1836 / AB 2602; SAG-AFTRA digital-replica documentation",
      status: missingConsent.length === 0 ? "pass" : "fail",
      blocks_binding: true,
      detail:
        missingConsent.length === 0
          ? "all replica subjects covered (or none present)"
          : `no consent on file for: ${missingConsent
              .map((s) => `${s.shot_id}${s.subject_name ? ` (${s.subject_name})` : ""}`)
              .join(", ")}`,
    },
    {
      id: "provenance_chain",
      requirement: "Provenance chain (C2PA Content Credentials) present for AI shots",
      basis: "C2PA 2.3 Content Credentials; distributor provenance requirement",
      status: aiShots.length === 0 ? "na" : withC2pa.length === aiShots.length ? "pass" : "fail",
      blocks_binding: false,
      detail: `${withC2pa.length}/${aiShots.length} AI shots carry a valid C2PA manifest`,
    },
    {
      id: "no_open_blocking_findings",
      requirement: "No open blocking clearance/compliance findings (all resolved or waived)",
      basis: "Rights clearance; distributor deliverable requirement",
      status: openBlocking.length === 0 ? "pass" : "fail",
      blocks_binding: true,
      detail:
        openBlocking.length === 0
          ? "no open blocking findings"
          : `${openBlocking.length} open blocking: ${openBlocking.map((f) => f.finding_id).join(", ")}`,
    },
    {
      id: "signed_certificate",
      requirement: "A signed, independently verifiable QA certificate is attached",
      basis: "Radar hash-chained, KMS-signed certificate (Appendix D)",
      status: cert ? "pass" : "fail",
      blocks_binding: true,
      detail: cert
        ? `certificate ${cert.slug} — verify at ${(input.verify_prefix ?? "/verify")}/${cert.slug}`
        : "scene is not yet LOCKED — no certificate issued",
    },
    {
      id: "delivery_readiness",
      requirement: "Scene is delivery-ready for every declared territory and platform",
      basis: "Radar Delivery Readiness over the declared distribution profile",
      status: input.delivery.ready ? "pass" : "fail",
      blocks_binding: false,
      detail: input.delivery.targets
        .map((t) => `${t.label}: ${t.ready ? "ready" : "blocked"}`)
        .join("; "),
    },
  ];

  const blocking_gaps = checklist
    .filter((c) => c.blocks_binding && c.status === "fail")
    .map((c) => `${c.requirement} — ${c.detail}`);
  const bindable = blocking_gaps.length === 0;

  return {
    pack_id: input.pack_id,
    production_id: input.production.production_id,
    scene_id: input.scene_id,
    generated_at: input.now,
    schema_version: "1.0",
    production_summary: {
      title: input.production.title,
      org_id: input.production.org_id,
      territories: input.profile.territories,
      platforms: input.profile.platforms,
    },
    bindable,
    blocking_gaps,
    coverage_note:
      "Distributors typically require $1M per claim / $3M aggregate E&O; 2026 policies " +
      "exclude AI-generated content unless disclosure, consent and provenance are documented. " +
      (bindable
        ? "This pack documents all three; an underwriter can review to bind."
        : "This pack surfaces the gaps an underwriter would raise before binding."),
    trust: { score: input.trust.score, band: input.trust.band, headline: input.trust.headline },
    delivery_ready: input.delivery.ready,
    delivery_targets: input.delivery.targets.map((t) => ({ label: t.label, ready: t.ready })),
    checklist,
    shot_disclosures,
    consent_ledger,
    findings_ledger,
    certificate: {
      present: !!cert,
      certificate_id: cert?.certificate_id ?? null,
      slug: cert?.slug ?? null,
      certificate_hash: cert?.payload.certificate_hash ?? null,
      kms_key_version: cert?.payload.kms_key_version ?? null,
      lock_timestamp: cert?.payload.lock_timestamp ?? null,
      verify_path: cert ? `${input.verify_prefix ?? "/verify"}/${cert.slug}` : null,
    },
    disclaimer: UNDERWRITING_DISCLAIMER,
  };
}

const mark = (s: "pass" | "fail" | "na") => (s === "pass" ? "✅" : s === "fail" ? "❌" : "—");

/** Render the pack as a human-readable underwriter's binder (Markdown). */
export function renderUnderwritingMarkdown(pack: UnderwritingPack): string {
  const L: string[] = [];
  const ps = pack.production_summary;
  L.push(`# E&O / Underwriting Pack — ${ps.title}`);
  L.push("");
  L.push(`**Scene:** ${pack.scene_id}  ·  **Production:** ${pack.production_id}  ·  **Org:** ${ps.org_id}`);
  L.push(`**Generated:** ${pack.generated_at}  ·  **Pack:** ${pack.pack_id}`);
  L.push("");
  L.push(`## Verdict for underwriting: ${pack.bindable ? "✅ DOCUMENTED — reviewable to bind" : "❌ GAPS — not yet bindable"}`);
  L.push("");
  L.push(`Trust Score **${pack.trust.score}/100 (${pack.trust.band.toUpperCase()})** — ${pack.trust.headline}`);
  L.push("");
  L.push(pack.coverage_note);
  if (pack.blocking_gaps.length) {
    L.push("");
    L.push("**Blocking gaps:**");
    for (const g of pack.blocking_gaps) L.push(`- ${g}`);
  }

  L.push("");
  L.push("## 1. Underwriter checklist");
  L.push("");
  L.push("| | Requirement | Basis | Detail |");
  L.push("|---|---|---|---|");
  for (const c of pack.checklist)
    L.push(`| ${mark(c.status)} | ${c.requirement}${c.blocks_binding ? "" : " *(advisory)*"} | ${c.basis} | ${c.detail} |`);

  L.push("");
  L.push("## 2. Per-shot AI-disclosure schedule");
  L.push("");
  L.push("| Shot | AI | Replica | Subject | C2PA | Watermark | Label | Consent | Documented |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const s of pack.shot_disclosures) {
    const c2pa = s.c2pa_valid ? "valid" : s.c2pa_present ? "invalid" : "—";
    const wm = s.watermark_detectable ? s.watermark_method : "—";
    const consent = !s.consent_required ? "n/a" : s.consent_on_file ? "on file" : "MISSING";
    L.push(
      `| ${s.shot_id} | ${s.is_ai_generated ? "yes" : "no"} | ${s.replica_kind} | ${s.subject_name ?? "—"} | ${c2pa} | ${wm} | ${s.perceptible_label ? "yes" : "—"} | ${consent} | ${s.documented ? "✅" : "❌"} |`,
    );
  }

  L.push("");
  L.push("## 3. Consent ledger");
  L.push("");
  if (pack.consent_ledger.length === 0) L.push("_No consent records on file._");
  else {
    L.push("| Record | Subject | Kind | Status | Expiry | Document |");
    L.push("|---|---|---|---|---|---|");
    for (const r of pack.consent_ledger)
      L.push(`| ${r.record_id} | ${r.subject} | ${r.kind} | ${r.status} | ${r.expiry ?? "—"} | ${r.doc_uri ?? "—"} |`);
  }

  L.push("");
  L.push("## 4. Clearance & compliance findings (with waiver trail)");
  L.push("");
  if (pack.findings_ledger.length === 0) L.push("_No clearance or compliance findings._");
  else {
    L.push("| Finding | Shot | Risk class | Severity | Blocking | Status | Disposition |");
    L.push("|---|---|---|---|---|---|---|");
    for (const f of pack.findings_ledger)
      L.push(
        `| ${f.finding_id} | ${f.shot_id ?? "—"} | ${f.risk_class} | ${f.severity} | ${f.blocking ? "yes" : "no"} | ${f.status} | ${f.disposition ?? "—"} |`,
      );
  }

  L.push("");
  L.push("## 5. Signed certificate");
  L.push("");
  const c = pack.certificate;
  if (c.present) {
    L.push(`- **Slug:** ${c.slug}`);
    L.push(`- **Hash:** \`${c.certificate_hash}\``);
    L.push(`- **KMS key:** ${c.kms_key_version}`);
    L.push(`- **Locked:** ${c.lock_timestamp}`);
    L.push(`- **Public verify:** ${c.verify_path}`);
  } else {
    L.push("_Scene is not yet LOCKED — no certificate issued. Resolve the blocking gaps above, then certify._");
  }

  L.push("");
  L.push("## 6. Delivery readiness");
  L.push("");
  for (const t of pack.delivery_targets) L.push(`- ${t.ready ? "✅" : "❌"} ${t.label}`);

  L.push("");
  L.push("---");
  L.push(`_${pack.disclaimer}_`);
  L.push("");
  return L.join("\n");
}
