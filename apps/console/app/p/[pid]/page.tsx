import Link from "next/link";
import { api } from "@/lib/api";
import { VerdictMathBar } from "@/components/VerdictMathBar";
import { CostMeter } from "@/components/CostMeter";
import { KillSwitchControl } from "@/components/KillSwitchControl";
import { PageHeader } from "@/components/PageHeader";

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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Production"
        title={production.title}
        sub={`${pid} · ${production.mode} · τ ${production.settings.tau}`}
        status={verdict.verdict}
        statusTone={verdict.verdict === "LOCKED" ? "locked" : verdict.verdict === "HELD" ? "held" : "error"}
      >
        {trust && (
          <Link
            href={`/p/${pid}/compliance`}
            className="flex items-center gap-2 border rounded-[8px] px-3 py-[6px] hover:bg-[var(--color-bg-raise)] transition-colors"
            style={{ borderColor: TRUST_TONE[trust.band] }}
            title={trust.headline}
          >
            <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Trust</span>
            <span className="mono text-[20px] font-medium leading-none" style={{ color: TRUST_TONE[trust.band] }}>
              {trust.score}
            </span>
            <span className="mono text-[9px] uppercase" style={{ color: TRUST_TONE[trust.band] }}>
              {trust.band}
            </span>
          </Link>
        )}
        {certBundle && (
          <Link
            href={`/p/${pid}/certificates/${certBundle.certificate.certificate_id}`}
            className="chip chip-solid"
            style={{ color: "var(--color-status-certified)" }}
          >
            signed certificate →
          </Link>
        )}
      </PageHeader>

      <VerdictMathBar v={verdict} />

      <div className="section-card p-5 rise">
        <div className="vmb-k mb-3" style={{ color: "var(--color-accent)" }}>scenes</div>
        <div className="flex gap-3 flex-wrap">
          {scenes.map((s) => {
            const locked = s.verdict?.verdict === "LOCKED";
            const tone = locked ? "var(--color-status-locked)" : "var(--color-status-held)";
            return (
              <Link
                key={s.scene_id}
                href={`/p/${pid}/scenes/${s.scene_id}`}
                className="card rail px-4 py-3 min-w-[220px]"
                style={{ ["--rail-color" as string]: tone }}
              >
                <div className="mono text-[12px]">{s.scene_id}</div>
                <div className="text-[var(--color-text-secondary)] text-[12px] mt-[2px]">
                  {s.heading}
                </div>
                <div className="mono text-[11px] mt-2 font-medium" style={{ color: tone }}>
                  {s.verdict?.verdict ?? s.status}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <CostMeter detail={budget.detail} level={budget.level} killSwitch={budget.kill_switch} />
        <KillSwitchControl pid={pid} engaged={production.kill_switch} />
      </div>
    </div>
  );
}
