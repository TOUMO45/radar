import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Music & Cues (R6) — the PRO cue sheet + rights status; rides the certificate. */
const STATUS_TONE: Record<string, string> = {
  cleared: "var(--color-status-locked)",
  production_music: "var(--color-status-locked)",
  public_domain: "var(--color-status-locked)",
  pending: "var(--color-status-held)",
  unlicensed: "var(--color-status-error)",
};
const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export default async function MusicPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const scenes = await api.listScenes(pid);
  const sid = scenes[0]?.scene_id;
  const data = sid ? await api.getCueSheet(sid) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-medium">Music &amp; Cue Sheet</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">{sid}</span>
      </div>

      {!data ? (
        <div className="panel px-4 py-6 text-[var(--color-text-secondary)]">No cue sheet available.</div>
      ) : (
        <>
          <div className="panel p-4 flex items-center gap-8">
            <div>
              <div className="vmb-k">cues</div>
              <div className="mono text-[22px]">{data.cue_sheet.total_cues}</div>
            </div>
            <div>
              <div className="vmb-k">cleared</div>
              <div className="mono text-[22px]" style={{ color: "var(--color-status-locked)" }}>{data.cue_sheet.cleared_cues}</div>
            </div>
            <div>
              <div className="vmb-k">uncleared</div>
              <div className="mono text-[22px]" style={{ color: data.cue_sheet.uncleared_cues ? "var(--color-status-error)" : "var(--color-status-locked)" }}>{data.cue_sheet.uncleared_cues}</div>
            </div>
            <div>
              <div className="vmb-k">total music</div>
              <div className="mono text-[22px]">{fmtMs(data.cue_sheet.total_music_ms)}</div>
            </div>
            <span className="ml-auto mono text-[10px] text-[var(--color-text-secondary)] normal-case">this cue sheet rides in the signed certificate&rsquo;s music appendix</span>
          </div>

          <div className="panel">
            <div className="vmb-k px-4 py-2 border-b">Cue sheet — {data.cue_sheet.production_title}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[var(--color-text-secondary)] text-left">
                    {["TC", "Title", "Writers", "Publisher", "Use", "Dur", "Status", "Licence"].map((h) => (
                      <th key={h} className="px-3 py-2 font-normal mono text-[10px] uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cue_sheet.cues.map((c) => (
                    <tr key={c.cue_id as string} className="border-t border-[var(--color-line-hair)]">
                      <td className="px-3 py-2 mono text-[11px] text-[var(--color-text-secondary)]">{(c.timecode_in as string) ?? "—"}</td>
                      <td className="px-3 py-2">{c.title as string}</td>
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">{(c.writers as string[]).join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">{(c.publisher as string) ?? "—"}</td>
                      <td className="px-3 py-2 mono text-[11px]">{c.use as string}</td>
                      <td className="px-3 py-2 mono text-[11px]">{fmtMs(c.duration_ms as number)}</td>
                      <td className="px-3 py-2 mono text-[10px] uppercase" style={{ color: STATUS_TONE[c.license_status as string] ?? "var(--color-text-secondary)" }}>
                        {(c.license_status as string).replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 mono text-[11px] text-[var(--color-text-secondary)]">{(c.license_type as string) === "none" ? "—" : (c.license_type as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.findings.length > 0 && (
            <div className="panel">
              <div className="vmb-k px-4 py-2 border-b">{data.findings.length} music-rights finding{data.findings.length === 1 ? "" : "s"}</div>
              {data.findings.map((f) => (
                <div key={f.finding_id} className="px-4 py-3 border-b last:border-b-0 flex items-start gap-3">
                  <span className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px] border mt-[2px] border-[var(--color-line-hair)]" style={{ color: STATUS_TONE.unlicensed }}>{f.severity}</span>
                  <div className="flex-1">
                    <div className="text-[13px]">{f.description}</div>
                    <div className="text-[11px] text-[var(--color-text-secondary)] mt-[2px]">↳ {f.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="panel p-3 text-[11px] text-[var(--color-text-secondary)]" style={{ borderLeft: "3px solid var(--color-status-held)" }}>
        The cue sheet is the document ASCAP/BMI/PRS and broadcasters require. Uncleared cues raise a
        <span className="mono"> music_rights</span> finding; clear them (sync + master), swap for production music, or remove.
      </div>
    </div>
  );
}
