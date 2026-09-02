import Link from "next/link";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * S14 — E&O / Underwriting Pack (Radar 2026 extension, roadmap R1).
 * The single binder a distributor's insurer reads to bind AI-content coverage:
 * bindable verdict + underwriter checklist + per-shot disclosure schedule +
 * consent ledger + clearance/compliance findings with waiver trail + the signed
 * certificate + delivery readiness. Every line is documented, not asserted.
 */

const CHECK_MARK: Record<string, string> = { pass: "✓", fail: "✕", na: "—" };
const CHECK_TONE: Record<string, string> = {
  pass: "var(--color-status-locked)",
  fail: "var(--color-status-error)",
  na: "var(--color-text-secondary)",
};
const BAND_TONE: Record<string, string> = {
  green: "var(--color-status-locked)",
  amber: "var(--color-status-held)",
  red: "var(--color-status-error)",
};

export default async function UnderwritingPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const scenes = await api.listScenes(pid);
  const sid = scenes[0]?.scene_id;
  const pack = sid ? await api.getUnderwritingPack(sid) : null;

  if (!pack) {
    return (
      <div className="flex flex-col gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← overview
        </Link>
        <div className="panel px-4 py-6 text-[var(--color-text-secondary)]">
          No underwriting pack available for this production.
        </div>
      </div>
    );
  }

  const bindTone = pack.bindable ? "var(--color-status-locked)" : "var(--color-status-error)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← overview
        </Link>
        <h1 className="text-[18px] font-medium">E&amp;O / Underwriting Pack</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{pack.scene_id}</span>
        <a
          href={`/api/v1/scenes/${pack.scene_id}/underwriting-pack.md`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto mono text-[11px] px-2 py-[3px] rounded-[3px] border border-[var(--color-line-hair)] text-[var(--color-source-deterministic)]"
        >
          open binder (.md) ↗
        </a>
      </div>

      {/* Bindable verdict */}
      <div className="panel p-4 flex items-center gap-5" style={{ borderLeft: `3px solid ${bindTone}` }}>
        <div className="flex flex-col items-center justify-center rounded-[10px] border w-[150px] py-3" style={{ borderColor: bindTone }}>
          <span className="mono text-[13px] uppercase" style={{ color: bindTone }}>
            {pack.bindable ? "documented" : "gaps"}
          </span>
          <span className="text-[11px] mt-1 text-center px-2 text-[var(--color-text-secondary)]">
            {pack.bindable ? "reviewable to bind" : "not yet bindable"}
          </span>
        </div>
        <div className="flex-1">
          <div className="vmb-k mb-1">Underwriting readiness</div>
          <div className="text-[13px] text-[var(--color-text-secondary)] mb-2">{pack.coverage_note}</div>
          <div className="flex items-center gap-3 text-[12px]">
            <span>
              Trust{" "}
              <span className="mono font-medium" style={{ color: BAND_TONE[pack.trust.band] }}>
                {pack.trust.score}/100 ({pack.trust.band})
              </span>
            </span>
            <span className="text-[var(--color-text-secondary)]">·</span>
            <span>
              Delivery{" "}
              <span className="mono" style={{ color: pack.delivery_ready ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                {pack.delivery_ready ? "ready" : "blocked"}
              </span>
            </span>
            <span className="text-[var(--color-text-secondary)]">·</span>
            <span>
              Certificate{" "}
              <span className="mono" style={{ color: pack.certificate.present ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                {pack.certificate.present ? pack.certificate.slug : "none"}
              </span>
            </span>
          </div>
          {pack.blocking_gaps.length > 0 && (
            <ul className="mt-2 flex flex-col gap-[2px]">
              {pack.blocking_gaps.map((g, i) => (
                <li key={i} className="text-[11px] text-[var(--color-status-error)]">
                  ✕ {g}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Underwriter checklist */}
      <div className="panel">
        <div className="vmb-k px-4 py-2 border-b">Underwriter checklist</div>
        <div className="flex flex-col">
          {pack.checklist.map((c) => (
            <div key={c.id} className="px-4 py-3 border-b last:border-b-0 flex items-start gap-3">
              <span className="mono text-[16px] leading-none mt-[1px]" style={{ color: CHECK_TONE[c.status] }}>
                {CHECK_MARK[c.status]}
              </span>
              <div className="flex-1">
                <div className="text-[13px]">
                  {c.requirement}
                  {!c.blocks_binding && (
                    <span className="mono text-[9px] uppercase ml-2 text-[var(--color-text-secondary)]">advisory</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-text-secondary)] mt-[2px]">{c.detail}</div>
                <div className="mono text-[10px] text-[var(--color-text-secondary)] mt-[1px]">basis: {c.basis}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-shot disclosure schedule */}
      <div className="panel">
        <div className="vmb-k px-4 py-2 border-b">Per-shot AI-disclosure schedule</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[var(--color-text-secondary)] text-left">
                {["Shot", "AI", "Replica", "Subject", "C2PA", "Watermark", "Label", "Consent", "OK"].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal mono text-[10px] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pack.shot_disclosures.map((s) => (
                <tr key={s.shot_id} className="border-t border-[var(--color-line-hair)]">
                  <td className="px-3 py-2 mono text-[11px]">{s.shot_id}</td>
                  <td className="px-3 py-2">{s.is_ai_generated ? "yes" : "no"}</td>
                  <td className="px-3 py-2">{s.replica_kind}</td>
                  <td className="px-3 py-2">{s.subject_name ?? "—"}</td>
                  <td className="px-3 py-2 mono text-[11px]" style={{ color: s.c2pa_valid ? "var(--color-status-locked)" : s.c2pa_present ? "var(--color-status-error)" : undefined }}>
                    {s.c2pa_valid ? "valid" : s.c2pa_present ? "invalid" : "—"}
                  </td>
                  <td className="px-3 py-2 mono text-[11px]" style={{ color: s.watermark_detectable ? "var(--color-status-locked)" : undefined }}>
                    {s.watermark_detectable ? s.watermark_method : "—"}
                  </td>
                  <td className="px-3 py-2">{s.perceptible_label ? "yes" : "—"}</td>
                  <td className="px-3 py-2 mono text-[11px]" style={{ color: !s.consent_required ? undefined : s.consent_on_file ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                    {!s.consent_required ? "n/a" : s.consent_on_file ? "on file" : "MISSING"}
                  </td>
                  <td className="px-3 py-2" style={{ color: s.documented ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                    {s.documented ? "✓" : "✕"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings ledger with waiver trail */}
      <div className="panel">
        <div className="vmb-k px-4 py-2 border-b">
          Clearance &amp; compliance findings — {pack.findings_ledger.length} on record
        </div>
        {pack.findings_ledger.length === 0 ? (
          <div className="px-4 py-6 text-[var(--color-text-secondary)]">No clearance or compliance findings.</div>
        ) : (
          <div className="flex flex-col">
            {pack.findings_ledger.map((f) => (
              <div key={f.finding_id} className="px-4 py-3 border-b last:border-b-0 flex items-start gap-3">
                <span className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px] border mt-[2px] border-[var(--color-line-hair)]">
                  {f.severity}
                </span>
                {f.blocking && (
                  <span className="mono text-[9px] uppercase px-2 py-[1px] rounded-[2px] mt-[2px]" style={{ background: "var(--color-status-error)", color: "#fff" }}>
                    blocking
                  </span>
                )}
                <div className="flex-1">
                  <div className="text-[13px]">{f.description}</div>
                  <div className="mono text-[10px] text-[var(--color-text-secondary)] mt-[2px]">
                    {f.finding_id} · {f.risk_class} · {f.status}
                    {f.disposition ? ` — ${f.disposition}` : ""}
                  </div>
                </div>
                <span className="mono text-[10px] text-[var(--color-text-secondary)] mt-[2px]">{f.shot_id ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Consent ledger + certificate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="panel">
          <div className="vmb-k px-4 py-2 border-b">Consent ledger</div>
          {pack.consent_ledger.length === 0 ? (
            <div className="px-4 py-6 text-[var(--color-text-secondary)]">No consent records on file.</div>
          ) : (
            <div className="flex flex-col">
              {pack.consent_ledger.map((r) => (
                <div key={r.record_id} className="px-4 py-2 border-b last:border-b-0 flex items-center gap-2 text-[12px]">
                  <span className="flex-1">{r.subject}</span>
                  <span className="mono text-[10px] text-[var(--color-text-secondary)]">{r.kind}</span>
                  <span className="mono text-[10px] uppercase" style={{ color: r.status === "active" ? "var(--color-status-locked)" : "var(--color-status-held)" }}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="vmb-k px-4 py-2 border-b">Signed certificate</div>
          {pack.certificate.present ? (
            <div className="px-4 py-3 flex flex-col gap-[4px] text-[12px]">
              <div>
                slug <span className="mono">{pack.certificate.slug}</span>
              </div>
              <div className="mono text-[10px] break-all text-[var(--color-text-secondary)]">
                {pack.certificate.certificate_hash}
              </div>
              <div className="text-[11px] text-[var(--color-text-secondary)]">
                key {pack.certificate.kms_key_version} · locked {pack.certificate.lock_timestamp}
              </div>
              {pack.certificate.verify_path && (
                <a href={pack.certificate.verify_path} target="_blank" rel="noreferrer" className="mono text-[11px] text-[var(--color-source-deterministic)]">
                  public verify ↗
                </a>
              )}
            </div>
          ) : (
            <div className="px-4 py-6 text-[var(--color-text-secondary)] text-[12px]">
              Scene not yet LOCKED — resolve the blocking gaps above, then certify to attach a signed certificate.
            </div>
          )}
        </div>
      </div>

      <div className="panel p-3 text-[11px] text-[var(--color-text-secondary)]" style={{ borderLeft: "3px solid var(--color-status-held)" }}>
        {pack.disclaimer}
      </div>
    </div>
  );
}
