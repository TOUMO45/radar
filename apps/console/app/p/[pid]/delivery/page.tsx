import Link from "next/link";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Delivery QC (R4) — the scene master vs each targeted platform's technical
 * delivery spec (loudness, captions, frame rate, resolution, colour, codec).
 */
const SEV_TONE: Record<string, string> = {
  high: "var(--color-status-error)",
  medium: "var(--color-status-held)",
  low: "var(--color-status-info)",
  info: "var(--color-status-info)",
};

export default async function DeliveryPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const scenes = await api.listScenes(pid);
  const sid = scenes[0]?.scene_id;
  const report = sid ? await api.getTechnicalDelivery(sid) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-medium">Technical Delivery QC</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{sid}</span>
        {report && (
          <span
            className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px]"
            style={{ color: report.passed ? "var(--color-status-locked)" : "var(--color-status-error)" }}
          >
            {report.passed ? "delivery clean" : `${report.findings.length} spec failure${report.findings.length === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {!report ? (
        <div className="panel px-4 py-6 text-[var(--color-text-secondary)]">No delivery report available.</div>
      ) : (
        <>
          {/* the master */}
          {report.master && (
            <div className="panel">
              <div className="vmb-k px-4 py-2 border-b">Assembled master</div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-[12px]">
                {Object.entries({
                  resolution: `${report.master.width}×${report.master.height}`,
                  fps: `${report.master.fps}`,
                  color: `${report.master.color_space}`,
                  bit_depth: `${report.master.bit_depth}-bit`,
                  codec: `${report.master.codec}`,
                  loudness: report.master.loudness_lkfs === null ? "—" : `${report.master.loudness_lkfs} LKFS`,
                  true_peak: report.master.true_peak_dbtp === null ? "—" : `${report.master.true_peak_dbtp} dBTP`,
                  captions: report.master.has_captions ? String(report.master.caption_format) : "absent",
                }).map(([k, v]) => (
                  <div key={k}>
                    <div className="vmb-k">{k.replace("_", " ")}</div>
                    <div className="mono text-[13px]">{v as string}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.targets.length === 0 && (
            <div className="panel p-3 text-[12px] text-[var(--color-text-secondary)]" style={{ borderLeft: "3px solid var(--color-status-held)" }}>
              No platform with an encoded technical spec is targeted. Add SVOD, broadcast, theatrical or YouTube to the
              production's compliance profile to run delivery QC.
            </div>
          )}

          {/* per-platform checks */}
          {report.targets.map((t) => (
            <div key={t.platform} className="panel">
              <div className="vmb-k px-4 py-2 border-b flex items-center gap-3">
                <span>{t.label}</span>
                <span
                  className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px]"
                  style={{ color: t.passed ? "var(--color-status-locked)" : "var(--color-status-error)" }}
                >
                  {t.passed ? "PASS" : "FAIL"}
                </span>
                <span className="ml-auto normal-case text-[var(--color-text-secondary)] text-[11px]">{t.citation}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[var(--color-text-secondary)] text-left">
                      {["", "Parameter", "Required", "Observed"].map((h, i) => (
                        <th key={i} className="px-4 py-2 font-normal mono text-[10px] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.checks.map((c) => (
                      <tr key={c.param} className="border-t border-[var(--color-line-hair)]">
                        <td className="px-4 py-2" style={{ color: c.ok ? "var(--color-status-locked)" : SEV_TONE[c.severity] }}>
                          {c.ok ? "✓" : "✕"}
                        </td>
                        <td className="px-4 py-2">{c.param.replace("_", " ")}</td>
                        <td className="px-4 py-2 mono text-[11px] text-[var(--color-text-secondary)]">{c.required}</td>
                        <td className="px-4 py-2 mono text-[11px]" style={{ color: c.ok ? undefined : SEV_TONE[c.severity] }}>{c.observed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="panel p-3 text-[11px] text-[var(--color-text-secondary)]" style={{ borderLeft: "3px solid var(--color-status-held)" }}>
        Specs are the real public standards: EBU R128 (broadcast), Netflix/IMF SMPTE ST 2067 (SVOD), DCI DCP
        (theatrical), YouTube web loudness. Deterministic — a master either meets the number or it doesn't.
      </div>
    </div>
  );
}
