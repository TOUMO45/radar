import Link from "next/link";
import { api } from "@/lib/api";
import { VerdictMathBar } from "@/components/VerdictMathBar";
import { CostMeter } from "@/components/CostMeter";
import { KillSwitchControl } from "@/components/KillSwitchControl";

export const dynamic = "force-dynamic";

/** S2 — Production Overview: verdict header, scenes strip, cost governor, kill switch. */
export default async function ProductionOverview({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const [{ production, verdict }, scenes, budget] = await Promise.all([
    api.getProduction(pid),
    api.listScenes(pid),
    api.getBudget(pid),
  ]);
  const firstScene = scenes[0]?.scene_id;
  const [certBundle, trust] = await Promise.all([
    firstScene ? api.getSceneCertificate(firstScene) : Promise.resolve(null),
    firstScene ? api.getTrustScore(firstScene) : Promise.resolve(null),
  ]);
  const TRUST_TONE: Record<string, string> = {
    green: "var(--color-status-locked)",
    amber: "var(--color-status-held)",
    red: "var(--color-status-error)",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-medium">{production.title}</h1>
        <span className="mono text-[11px] text-[var(--color-text-secondary)]">
          {pid} · {production.mode}
        </span>
        {trust && (
          <Link
            href={`/p/${pid}/compliance`}
            className="flex items-center gap-2 border rounded-[6px] px-2 py-1"
            style={{ borderColor: TRUST_TONE[trust.band] }}
            title={trust.headline}
          >
            <span className="mono text-[10px] uppercase text-[var(--color-text-secondary)]">Trust</span>
            <span className="mono text-[18px] font-medium" style={{ color: TRUST_TONE[trust.band] }}>
              {trust.score}
            </span>
            <span className="mono text-[9px] uppercase" style={{ color: TRUST_TONE[trust.band] }}>
              {trust.band}
            </span>
          </Link>
        )}
        <div className="ml-auto flex gap-4">
          <Link
            href={`/p/${pid}/compliance`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            compliance →
          </Link>
          <Link
            href={`/p/${pid}/underwriting`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            E&amp;O pack →
          </Link>
          <Link
            href={`/p/${pid}/findings`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            finding inbox →
          </Link>
          <Link
            href={`/p/${pid}/world`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            world state →
          </Link>
          <Link
            href={`/p/${pid}/loop`}
            className="mono text-[12px] text-[var(--color-source-deterministic)] underline"
          >
            loop monitor →
          </Link>
          {certBundle && (
            <Link
              href={`/p/${pid}/certificates/${certBundle.certificate.certificate_id}`}
              className="mono text-[12px] text-[var(--color-status-certified)] underline"
            >
              certificate →
            </Link>
          )}
        </div>
      </div>

      <VerdictMathBar v={verdict} />

      <div className="panel p-4">
        <div className="vmb-k mb-2">scenes</div>
        <div className="flex gap-2 flex-wrap">
          {scenes.map((s) => (
            <Link
              key={s.scene_id}
              href={`/p/${pid}/scenes/${s.scene_id}`}
              className="border rounded-[6px] px-3 py-2 hover:bg-[var(--color-bg-raise)]"
            >
              <div className="mono text-[12px]">{s.scene_id}</div>
              <div className="text-[var(--color-text-secondary)] text-[12px]">
                {s.heading}
              </div>
              <div
                className="mono text-[11px] mt-1"
                style={{
                  color:
                    s.verdict?.verdict === "LOCKED"
                      ? "var(--color-status-locked)"
                      : "var(--color-status-held)",
                }}
              >
                {s.verdict?.verdict ?? s.status}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-3">
        <CostMeter detail={budget.detail} level={budget.level} killSwitch={budget.kill_switch} />
        <KillSwitchControl pid={pid} engaged={production.kill_switch} />
      </div>
    </div>
  );
}
