import Link from "next/link";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * S13 — Compliance & Delivery (Radar 2026 extension).
 * Trust Score + per-territory/platform Delivery Readiness + cited compliance
 * findings. The screen a producer takes to distribution.
 */

const BAND_TONE: Record<string, string> = {
  green: "var(--color-status-locked)",
  amber: "var(--color-status-held)",
  red: "var(--color-status-error)",
};

const SEV_TONE: Record<string, string> = {
  high: "var(--color-status-error)",
  medium: "var(--color-status-held)",
  low: "var(--color-status-info)",
  info: "var(--color-status-info)",
};

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const scenes = await api.listScenes(pid);
  const sid = scenes[0]?.scene_id;
  const [trust, delivery, compliance] = await Promise.all([
    sid ? api.getTrustScore(sid) : Promise.resolve(null),
    sid ? api.getDeliveryReadiness(sid) : Promise.resolve(null),
    sid ? api.getCompliance(sid) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← overview
        </Link>
        <h1 className="text-[18px] font-medium">Compliance &amp; Delivery</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{sid}</span>
        <Link href={`/p/${pid}/underwriting`} className="ml-auto mono text-[12px] text-[var(--color-source-deterministic)] underline">
          E&amp;O / underwriting pack →
        </Link>
      </div>

      {/* Trust Score */}
      {trust && (
        <div className="panel p-4 flex items-center gap-5">
          <div
            className="flex flex-col items-center justify-center rounded-[10px] border w-[120px] py-3"
            style={{ borderColor: BAND_TONE[trust.band] }}
          >
            <span className="mono text-[44px] leading-none font-medium" style={{ color: BAND_TONE[trust.band] }}>
              {trust.score}
            </span>
            <span className="mono text-[11px] uppercase mt-1" style={{ color: BAND_TONE[trust.band] }}>
              {trust.band}
            </span>
          </div>
          <div className="flex-1">
            <div className="vmb-k mb-1">Radar Trust Score</div>
            <div className="text-[14px] mb-3" style={{ color: BAND_TONE[trust.band] }}>
              {trust.headline}
            </div>
            <div className="flex flex-col gap-[6px]">
              {trust.breakdown.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="text-[12px] w-[220px] text-[var(--color-text-secondary)]">
                    {d.label} <span className="mono text-[10px]">·{Math.round(d.weight * 100)}%</span>
                  </span>
                  <div className="flex-1 h-[6px] rounded-full bg-[var(--color-bg-raise)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${d.score}%`,
                        background: d.score >= 85 ? "var(--color-status-locked)" : d.score >= 60 ? "var(--color-status-held)" : "var(--color-status-error)",
                      }}
                    />
                  </div>
                  <span className="mono text-[12px] w-[36px] text-right">{d.score}</span>
                  <span className="mono text-[10px] text-[var(--color-text-secondary)] w-[120px]">{d.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Readiness */}
      {delivery && (
        <div className="panel">
          <div className="vmb-k px-4 py-2 border-b flex items-center gap-3">
            <span>Delivery Readiness</span>
            <span
              className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px]"
              style={{ color: delivery.ready ? "var(--color-status-locked)" : "var(--color-status-error)" }}
            >
              {delivery.ready ? "clear to ship" : "not deliverable"}
            </span>
            <span className="ml-auto normal-case text-[var(--color-text-secondary)]">
              can this scene legally ship, per target, right now?
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-[1px] bg-[var(--color-line-hair)]">
            {delivery.targets.map((t) => (
              <div key={`${t.kind}:${t.id}`} className="bg-[var(--color-bg-panel)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-[8px] h-[8px] rounded-full"
                    style={{ background: t.ready ? "var(--color-status-locked)" : "var(--color-status-error)" }}
                  />
                  <span className="text-[13px]">{t.label}</span>
                  <span className="mono text-[9px] uppercase ml-auto text-[var(--color-text-secondary)]">{t.kind}</span>
                </div>
                <div className="mono text-[10px] mt-1" style={{ color: t.ready ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
                  {t.ready ? "READY" : "BLOCKED"}
                </div>
                {t.blocking_rule_ids.length > 0 && (
                  <div className="mono text-[9px] text-[var(--color-status-error)] mt-[2px]">
                    {t.blocking_rule_ids.join(", ")}
                  </div>
                )}
                {t.notes.length > 0 && (
                  <div className="text-[10px] text-[var(--color-text-secondary)] mt-[2px]">
                    {t.notes.length} advisory note{t.notes.length === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cited compliance findings */}
      {compliance && (
        <div className="panel">
          <div className="vmb-k px-4 py-2 border-b flex items-center gap-3">
            <span>{compliance.findings.length} compliance finding{compliance.findings.length === 1 ? "" : "s"}</span>
            <span className="ml-auto normal-case text-[var(--color-text-secondary)]">
              targets in force: {compliance.profile.territories.join(", ")} · {compliance.profile.platforms.join(", ") || "no platforms"}
            </span>
          </div>
          {compliance.findings.length === 0 ? (
            <div className="px-4 py-6 text-[var(--color-text-secondary)]">Radar quiet — nothing to disclose.</div>
          ) : (
            <div className="flex flex-col">
              {compliance.findings.map((f) => (
                <div key={f.finding_id} className="px-4 py-3 border-b last:border-b-0 flex items-start gap-3">
                  <span
                    className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px] border mt-[2px]"
                    style={{ color: SEV_TONE[f.severity], borderColor: "var(--color-line-hair)" }}
                  >
                    {f.severity}
                  </span>
                  {f.blocking && (
                    <span className="mono text-[9px] uppercase px-2 py-[1px] rounded-[2px] mt-[2px]" style={{ background: "var(--color-status-error)", color: "#fff" }}>
                      blocking
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="text-[13px]">{f.description}</div>
                    <div className="text-[11px] text-[var(--color-text-secondary)] mt-[2px]">↳ {f.recommendation}</div>
                  </div>
                  <span className="mono text-[10px] text-[var(--color-text-secondary)] mt-[2px]">{f.shot_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="panel p-3 text-[11px] text-[var(--color-text-secondary)]"
        style={{ borderLeft: "3px solid var(--color-status-held)" }}
      >
        Rules are deterministic and cited (EU AI Act Art. 50, CA AB 1836/2602, NY synthetic-performer,
        platform policies). Radar is a radar, not a lawyer — it attests what a public obligation requires
        and whether provenance meets it; a human decides. Provenance/watermark detection (SynthID) runs
        live once GCP credentials are configured.
      </div>
    </div>
  );
}
