import Link from "next/link";
import { api } from "@/lib/api";
import { StateTimeline, DriftSparkline } from "@/components/StateTimeline";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, string> = {
  prop: "var(--color-source-deterministic)",
  wardrobe: "var(--color-source-hybrid)",
  character: "var(--color-source-model)",
  location: "var(--color-status-info)",
};

/** S6 — World State Browser (M4): entity cards, StateTimeline, drift sparkline, anchor version. */
export default async function WorldStateBrowser({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const entities = await api.listEntities(pid);
  const detailed = await Promise.all(entities.map((e) => api.getEntity(e.entity_id)));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Review"
        title="World State"
        sub="Every tracked entity — props, wardrobe, characters, locations — with its canonical description, anchor version and state history across shots."
        backHref={`/p/${pid}`}
        backLabel={pid}
        status={`${detailed.length} ${detailed.length === 1 ? "entity" : "entities"}`}
        statusTone="accent"
      >
        <Link
          href={`/p/${pid}/consent`}
          className="chip chip-soft hover:text-[var(--color-text-primary)]"
        >
          consent registry →
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-3 stagger">
        {detailed.map(({ entity: e, state_events }) => (
          <div
            key={e.entity_id}
            className="section-card rail p-4 flex flex-col gap-2"
            style={{ ["--rail-color" as string]: TYPE_TONE[e.type] }}
          >
            <div className="flex items-center gap-2">
              <span
                className="mono text-[10px] uppercase px-2 py-[1px] rounded-[2px] border"
                style={{ color: TYPE_TONE[e.type], borderColor: "var(--color-line-hair)" }}
              >
                {e.type}
              </span>
              <span className="mono text-[12px]">{e.entity_id}</span>
              <span
                className="mono text-[10px] px-2 py-[1px] rounded-[2px]"
                style={{ background: "var(--color-bg-raise)", color: "var(--color-text-secondary)" }}
              >
                {e.embedding_model_version ?? "no anchor"}
              </span>
              <span
                className="ml-auto mono text-[11px]"
                style={{
                  color:
                    e.status === "active"
                      ? "var(--color-status-locked)"
                      : e.status === "planned"
                        ? "var(--color-status-info)"
                        : "var(--color-status-held)",
                }}
              >
                {e.status} · {e.current_state ?? "—"}
              </span>
            </div>

            <div className="text-[13px]">{e.canonical_desc}</div>
            {e.facts.length > 0 && (
              <div className="text-[11px] text-[var(--color-text-secondary)]">
                facts: {e.facts.join(" · ")}
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <div className="vmb-k mb-1">state timeline</div>
                <StateTimeline events={state_events} />
              </div>
              {e.type === "character" && (
                <div>
                  <div className="vmb-k mb-1">identity drift</div>
                  <DriftSparkline seed={e.entity_id} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
