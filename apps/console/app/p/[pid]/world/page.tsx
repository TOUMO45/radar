import Link from "next/link";
import { api } from "@/lib/api";
import { StateTimeline, DriftSparkline } from "@/components/StateTimeline";

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
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← {pid}
        </Link>
        <h1 className="text-[18px] font-medium">World State</h1>
        <Link
          href={`/p/${pid}/consent`}
          className="ml-auto mono text-[12px] text-[var(--color-source-deterministic)] underline"
        >
          consent registry →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {detailed.map(({ entity: e, state_events }) => (
          <div key={e.entity_id} className="panel p-4 flex flex-col gap-2">
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
