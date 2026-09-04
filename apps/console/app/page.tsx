import Link from "next/link";
import { api } from "@/lib/api";
import { DemoRunner } from "@/components/DemoRunner";
import { EmptyRadar } from "@/components/EmptyRadar";
import { TrustGauge } from "@/components/TrustGauge";

export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, string> = {
  green: "var(--color-status-locked)",
  amber: "var(--color-status-held)",
  red: "var(--color-status-error)",
};
const slateBand = (n: number) => (n >= 85 ? "green" : n >= 60 ? "amber" : "red");

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
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between rise">
        <div>
          <div className="h-eyebrow">Slate</div>
          <h1 className="text-[22px] font-medium tracking-tight">Productions</h1>
        </div>
        <DemoRunner />
      </div>

      {/* Slate roll-up (R8) — hero */}
      {portfolio && portfolio.production_count > 0 && (
        <div
          className="panel-hero p-6 flex flex-col md:flex-row items-center gap-8 rise"
          style={{ ["--hero-accent" as string]: BAND_TONE[slateBand(portfolio.slate_trust)] }}
        >
          <TrustGauge
            score={portfolio.slate_trust}
            band={slateBand(portfolio.slate_trust)}
            label="slate trust"
            headline="Portfolio Trust across every lead scene"
          />
          <div className="flex-1 grid grid-cols-3 gap-3 w-full">
            <Kpi label="productions" value={String(portfolio.production_count)} />
            <Kpi
              label="delivery-ready"
              value={`${portfolio.deliverable_count}/${portfolio.production_count}`}
              tone={portfolio.deliverable_count === portfolio.production_count ? "green" : "amber"}
            />
            <Kpi
              label="E&O-bindable"
              value={`${portfolio.bindable_count}/${portfolio.production_count}`}
              tone={portfolio.bindable_count === portfolio.production_count ? "green" : "red"}
            />
          </div>
        </div>
      )}

      {rollups.length === 0 ? (
        <div className="panel">
          <EmptyRadar label="Radar quiet" openFindings={0} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 stagger">
          {rollups.map((r) => {
            const t = trustByPid.get(r.production.production_id);
            const held = r.open_blocking > 0;
            return (
              <div
                key={r.production.production_id}
                className="card rail p-4 flex flex-wrap items-center gap-5"
                style={{ ["--rail-color" as string]: held ? "var(--color-status-error)" : "var(--color-status-locked)" }}
              >
                <div className="flex-1 min-w-[200px]">
                  <Link
                    href={`/p/${r.production.production_id}`}
                    className="text-[16px] font-medium hover:text-[var(--color-accent)] transition-colors"
                  >
                    {r.production.title}
                  </Link>
                  <div className="mono text-[11px] text-[var(--color-text-secondary)] mt-[2px]">
                    {r.production.production_id} · {r.production.mode} · τ={r.production.settings.tau}
                  </div>
                  <div className="flex gap-1 mt-2">
                    {Object.entries(r.scenes_by_status).map(([status, n]) => (
                      <span key={status} className="chip chip-soft">
                        {status} {n as number}
                      </span>
                    ))}
                  </div>
                </div>

                {t && (
                  <Stat label="trust" value={String(t.trust_score)} sub={t.trust_band} tone={t.trust_band} />
                )}
                <Stat
                  label="open blocking"
                  value={String(r.open_blocking)}
                  tone={held ? "red" : "green"}
                />
                <Stat label="cost to date" value={`$${r.usd_spent.toFixed(2)}`} />

                <div className="flex gap-2">
                  <Link
                    href={`/p/${r.production.production_id}`}
                    className="chip text-[var(--color-accent)] hover:bg-[var(--color-bg-raise)]"
                  >
                    overview →
                  </Link>
                  <Link
                    href={`/p/${r.production.production_id}/scenes/sc_12`}
                    className="chip chip-soft hover:text-[var(--color-text-primary)]"
                  >
                    war room →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-4 flex flex-col gap-1 bg-[var(--color-bg-sink)]">
      <span className="h-eyebrow">{label}</span>
      <span className="mono text-[24px] font-medium" style={{ color: tone ? BAND_TONE[tone] : "var(--color-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="text-right min-w-[92px]">
      <div className="h-eyebrow">{label}</div>
      <div className="mono text-[17px] leading-tight" style={{ color: tone ? BAND_TONE[tone] : "var(--color-text-primary)" }}>
        {value}
        {sub && <span className="text-[9px] uppercase ml-1 opacity-80">{sub}</span>}
      </div>
    </div>
  );
}

function ApiDown() {
  return (
    <div className="panel p-4 rail" style={{ ["--rail-color" as string]: "var(--color-status-error)" }}>
      <div className="font-medium text-[var(--color-status-error)]">API unreachable</div>
      <div className="text-[var(--color-text-secondary)] mt-1">
        Start the core API first:{" "}
        <span className="mono">pnpm --filter @scenelock/api dev</span> (expects{" "}
        <span className="mono">{process.env.SCENELOCK_API_BASE}</span>).
      </div>
    </div>
  );
}
