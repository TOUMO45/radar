import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public certificate verification (spec G-16). Unauthenticated; no PII. */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let v: Awaited<ReturnType<typeof api.verify>> | null = null;
  try {
    v = await api.verify(slug);
  } catch {
    v = null;
  }

  const ok = v?.status === "valid" && v.chain_ok && v.signature_ok;
  const tone = !v || v.status === "unknown"
    ? "var(--color-text-secondary)"
    : ok
      ? "var(--color-status-locked)"
      : "var(--color-status-error)";

  return (
    <div className="max-w-[620px] mx-auto flex flex-col gap-4 py-6">
      <div className="mono text-[13px] text-[var(--color-text-secondary)]">
        RADAR · certificate verification
      </div>

      <div className="panel p-5 flex flex-col gap-3" style={{ borderLeft: `3px solid ${tone}` }}>
        <div className="flex items-center gap-3">
          <span className="mono text-[18px]" style={{ color: tone }}>
            {!v || v.status === "unknown" ? "UNKNOWN" : ok ? "VALID" : "INVALID"}
          </span>
          <span className="mono text-[12px] text-[var(--color-text-secondary)]">/verify/{slug}</span>
        </div>

        {v && v.status !== "unknown" ? (
          <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-[12px] mono">
            <dt className="text-[var(--color-text-secondary)]">project</dt>
            <dd>{v.project}</dd>
            <dt className="text-[var(--color-text-secondary)]">scene</dt>
            <dd>{v.scene}</dd>
            <dt className="text-[var(--color-text-secondary)]">locked at</dt>
            <dd>{v.lock_timestamp}</dd>
            <dt className="text-[var(--color-text-secondary)]">certificate hash</dt>
            <dd className="break-all">sha256:{v.certificate_hash}</dd>
            <dt className="text-[var(--color-text-secondary)]">prior hash</dt>
            <dd className="break-all">{v.prior_certificate_hash ? `sha256:${v.prior_certificate_hash}` : "— (genesis)"}</dd>
            <dt className="text-[var(--color-text-secondary)]">hash chain</dt>
            <dd style={{ color: v.chain_ok ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
              {v.chain_ok ? "intact" : "broken"}
            </dd>
            <dt className="text-[var(--color-text-secondary)]">signature</dt>
            <dd style={{ color: v.signature_ok ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
              {v.signature_ok ? "verified" : "invalid"}
            </dd>
          </dl>
        ) : (
          <div className="text-[12px] text-[var(--color-text-secondary)]">
            No certificate matches this slug.
          </div>
        )}
      </div>

      {v && (
        <div className="text-[11px] text-[var(--color-text-secondary)]">{v.disclaimer}</div>
      )}
    </div>
  );
}
