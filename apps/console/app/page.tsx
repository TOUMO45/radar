import Link from "next/link";
import { api } from "@/lib/api";
import { DemoRunner } from "@/components/DemoRunner";
import { EmptyRadar } from "@/components/EmptyRadar";

export const dynamic = "force-dynamic";

/** S1 — Productions (home). Portfolio status: scene-state chips, cost, open blocking. */
export default async function ProductionsPage() {
  let rollups;
  try {
    rollups = await api.listProductions();
  } catch {
    return <ApiDown />;
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-medium">Productions</h1>

      <DemoRunner />

      {rollups.length === 0 ? (
        <div className="panel">
          <EmptyRadar label="Radar quiet" openFindings={0} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rollups.map((r) => (
            <div
              key={r.production.production_id}
              className="panel p-4 flex items-center gap-4"
            >
              <div className="flex-1">
                <Link href={`/p/${r.production.production_id}`} className="text-[15px] hover:underline">
                  {r.production.title}
                </Link>
                <div className="mono text-[11px] text-[var(--color-text-secondary)]">
                  {r.production.production_id} · {r.production.mode} · τ={r.production.settings.tau}
                </div>
              </div>

              <div className="flex gap-1">
                {Object.entries(r.scenes_by_status).map(([status, n]) => (
                  <span
                    key={status}
                    className="mono text-[11px] px-2 py-[2px] rounded-[2px] border text-[var(--color-status-held)]"
                  >
                    {status} {n}
                  </span>
                ))}
              </div>

              <div className="text-right">
                <div className="vmb-k">open blocking</div>
                <div
                  className="mono text-[15px]"
                  style={{
                    color:
                      r.open_blocking > 0
                        ? "var(--color-status-error)"
                        : "var(--color-status-locked)",
                  }}
                >
                  {r.open_blocking}
                </div>
              </div>

              <div className="text-right w-24">
                <div className="vmb-k">cost to date</div>
                <div className="mono text-[15px]">${r.usd_spent.toFixed(2)}</div>
              </div>

              <Link
                href={`/p/${r.production.production_id}`}
                className="mono text-[11px] text-[var(--color-source-deterministic)] underline"
              >
                overview →
              </Link>
              <Link
                href={`/p/${r.production.production_id}/scenes/sc_12`}
                className="mono text-[11px] text-[var(--color-source-deterministic)] underline"
              >
                war room →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiDown() {
  return (
    <div
      className="panel p-4"
      style={{ borderLeft: "3px solid var(--color-status-error)" }}
    >
      <div className="font-medium text-[var(--color-status-error)]">API unreachable</div>
      <div className="text-[var(--color-text-secondary)] mt-1">
        Start the core API first:{" "}
        <span className="mono">pnpm --filter @scenelock/api dev</span> (expects{" "}
        <span className="mono">{process.env.SCENELOCK_API_BASE}</span>).
      </div>
    </div>
  );
}
