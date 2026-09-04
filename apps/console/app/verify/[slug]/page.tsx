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
  const unknown = !v || v.status === "unknown";
  const tone = unknown
    ? "var(--color-text-secondary)"
    : ok
      ? "var(--color-status-locked)"
      : "var(--color-status-error)";
  const glow = unknown ? "" : ok ? "glow-locked" : "glow-error";

  return (
    <div className="max-w-[640px] mx-auto flex flex-col gap-5 py-10 rise">
      <div className="flex items-center gap-2 justify-center">
        <span className="mono text-[15px] tracking-tight">
          RA<span className="text-[var(--color-accent)]">DAR</span>
        </span>
        <span className="h-eyebrow">certificate verification</span>
      </div>

      <div
        className={`panel-hero p-6 flex flex-col gap-4 ${glow}`}
        style={{ ["--hero-accent" as string]: tone }}
      >
        <div className="flex items-center gap-3">
          <span
            className="chip"
            style={{ color: tone, borderColor: tone, fontSize: 14, padding: "6px 12px" }}
          >
            {unknown ? "◌ UNKNOWN" : ok ? "✓ VALID" : "✗ INVALID"}
          </span>
          <span className="mono text-[12px] text-[var(--color-text-secondary)] break-all">
            /verify/{slug}
          </span>
        </div>

        {v && !unknown ? (
          <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-3 mono hair-t pt-4">
            <dt>project</dt>
            <dd>{v.project}</dd>
            <dt>scene</dt>
            <dd>{v.scene}</dd>
            <dt>locked at</dt>
            <dd>{v.lock_timestamp}</dd>
            <dt>certificate hash</dt>
            <dd className="break-all text-[var(--color-text-secondary)]">sha256:{v.certificate_hash}</dd>
            <dt>prior hash</dt>
            <dd className="break-all text-[var(--color-text-secondary)]">
              {v.prior_certificate_hash ? `sha256:${v.prior_certificate_hash}` : "— (genesis)"}
            </dd>
            <dt>hash chain</dt>
            <dd className="flex items-center gap-[6px]" style={{ color: v.chain_ok ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
              <span className="chip chip-dot" style={{ borderColor: "transparent", padding: 0 }} />
              {v.chain_ok ? "intact" : "broken"}
            </dd>
            <dt>signature</dt>
            <dd className="flex items-center gap-[6px]" style={{ color: v.signature_ok ? "var(--color-status-locked)" : "var(--color-status-error)" }}>
              <span className="chip chip-dot" style={{ borderColor: "transparent", padding: 0 }} />
              {v.signature_ok ? "verified" : "invalid"}
            </dd>
          </dl>
        ) : (
          <div className="text-[13px] text-[var(--color-text-secondary)] hair-t pt-4">
            No certificate matches this slug — it may not exist, or was never issued.
          </div>
        )}
      </div>

      {v && (
        <div className="text-[11px] text-[var(--color-text-faint)] text-center px-6">{v.disclaimer}</div>
      )}
    </div>
  );
}
