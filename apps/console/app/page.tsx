import Link from "next/link";
import { api } from "@/lib/api";
import { DemoRunner } from "@/components/DemoRunner";
import { EmptyRadar } from "@/components/EmptyRadar";

export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, string> = {
  green: "var(--color-status-locked)",
  amber: "var(--color-status-held)",
  red: "var(--color-status-error)",
};

/** S1 — Productions (home). Portfolio status: scene-state chips, cost, open blocking. */
export default async function ProductionsPage() {
  let rollups;
  try {
    rollups = await api.listProductions();
  } catch {
    return <ApiDown />;
  }
  const portfolio = await api.getPortfolio();
  const trustByPid = new Map((portfolio?.entries ?? []).map((e) => [e.production_id, e]));

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[18px] font-medium">Productions</h1>

      {/* Slate roll-up (R8) */}
      {portfolio && portfolio.production_count > 0 && (
        <div className="panel p-4 flex items-center gap-6">
          <div className="flex flex-col items-center justify-center rounded-[10px] border px-4 py-2" style={{ borderColor: BAND_TONE[portfolio.slate_trust >= 85 ? "green" : portfolio.slate_trust >= 60 ? "amber" : "red"] }}>
            <span className="mono text-[28px] leading-none font-medium" style={{ color: BAND_TONE[portfolio.slate_trust >= 85 ? "green" : portfolio.slate_trust >= 60 ? "amber" : "red"] }}>{portfolio.slate_trust}</span>
            <span className="mono text-[9px] uppercase mt-1 text-[var(--color-text-secondary)]">slate trust</span>
          </div>
          <div className="flex-1 flex gap-8">
            <div><div className="vmb-k">productions</div><div className="mono text-[18px]">{portfolio.production_count}</div></div>
            <div><div className="vmb-k">delivery-ready</div><div className="mono text-[18px]" style={{ color: portfolio.deliverable_count === portfolio.production_count ? "var(--color-status-locked)" : "var(--color-status-held)" }}>{portfolio.deliverable_count}/{portfolio.production_count}</div></div>
            <div><div className="vmb-k">E&amp;O-bindable</div><div className="mono text-[18px]" style={{ color: portfolio.bindable_count === portfolio.production_count ? "var(--color-status-locked)" : "var(--color-status-error)" }}>{portfolio.bindable_count}/{portfolio.production_count}</div></div>
          </div>
          <span className="mono text-[10px] text-[var(--color-text-secondary)] normal-case">slate deliverability at a glance</span>
        </div>
      )}

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

              {trustByPid.get(r.production.production_id) && (
                <div className="text-right">
                  <div className="vmb-k">trust</div>
                  <div className="mono text-[15px]" style={{ color: BAND_TONE[trustByPid.get(r.production.production_id)!.trust_band] }}>
                    {trustByPid.get(r.production.production_id)!.trust_score}
                    <span className="text-[9px] uppercase ml-1">{trustByPid.get(r.production.production_id)!.trust_band}</span>
                  </div>
                </div>
              )}

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
