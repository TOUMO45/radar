import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "var(--color-status-locked)",
  draft: "var(--color-status-info)",
  expired: "var(--color-status-error)",
};

/** S8 — Consent Registry (M4, read-only slice). PII: CMEK + access-logged in production (E.10). */
export default async function ConsentRegistry({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const records = await api.listConsent(pid);

  const active = records.filter((r) => r.status === "active").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Compliance & Delivery"
        title="Consent Registry"
        sub="Talent and likeness releases on file. The real_person clearance check fires when a matched public figure has no active record here."
        backHref={`/p/${pid}/world`}
        backLabel="world state"
        status={`${active}/${records.length} active`}
        statusTone={active === records.length && records.length > 0 ? "locked" : "held"}
      />

      <div className="section-card rise">
        <div className="section-head flex items-center gap-3" style={{ ["--head-color" as string]: "var(--color-status-certified)" }}>
          <span>{records.length} record{records.length === 1 ? "" : "s"}</span>
          <span className="ml-auto normal-case tracking-normal text-[var(--color-text-secondary)]">
            upload disabled in DRY_RUN — releases go to CMEK GCS + access log (E.10)
          </span>
        </div>
        {records.length === 0 ? (
          <div className="px-4 py-6 text-[var(--color-text-secondary)]">
            Radar quiet — no releases on file.
          </div>
        ) : (
          <div className="flex flex-col">
            {records.map((r) => (
              <div key={r.record_id} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-3">
                <span
                  className="mono text-[11px] uppercase px-2 py-[1px] rounded-[2px] border"
                  style={{ color: STATUS_TONE[r.status], borderColor: "var(--color-line-hair)" }}
                >
                  {r.status}
                </span>
                <span className="text-[13px] flex-1">{r.subject}</span>
                <span className="mono text-[11px] text-[var(--color-text-secondary)]">{r.kind}</span>
                {r.linked_figure_node_id && (
                  <span className="mono text-[11px] text-[var(--color-text-secondary)]">
                    → {r.linked_figure_node_id}
                  </span>
                )}
                <span className="mono text-[11px] text-[var(--color-text-secondary)]">
                  expires {r.expiry ? r.expiry.slice(0, 10) : "—"}
                </span>
                <span
                  className="mono text-[10px] px-2 py-[1px] rounded-[2px]"
                  style={{ background: "var(--color-bg-raise)", color: "var(--color-text-secondary)" }}
                >
                  redaction: {r.redaction_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="panel p-3 text-[11px] text-[var(--color-text-secondary)]"
        style={{ borderLeft: "3px solid var(--color-status-held)" }}
      >
        The <span className="mono">real_person</span> clearance check fires when a matched public
        figure has no <span className="mono">active</span> record here. Senator Dale Hargrove&apos;s
        release is <span className="mono">expired</span> — hence the shot-4 finding.
      </div>
    </div>
  );
}
