import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { HashChainView } from "@/components/HashChainView";

export const dynamic = "force-dynamic";

/** S9 — Certificate Viewer: rendered certificate, hash chain, disclaimer, verify link. */
export default async function CertificateViewer({
  params,
}: {
  params: Promise<{ pid: string; cid: string }>;
}) {
  const { pid, cid } = await params;
  let cert;
  try {
    cert = await api.getCertificate(cid);
  } catch {
    notFound();
  }
  const bundle = await api.getSceneCertificate(cert.scene_id);
  const chain = bundle?.chain ?? [];
  const p = cert.payload;

  return (
    <div className="flex flex-col gap-3 max-w-[820px]">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← {pid}
        </Link>
        <h1 className="text-[18px] font-medium">Clearance Certificate</h1>
        <span
          className="mono text-[11px] px-2 py-[2px] rounded-[2px] border"
          style={{ color: "var(--color-status-certified)", borderColor: "var(--color-status-certified)" }}
        >
          CERTIFIED
        </span>
      </div>

      <div className="panel p-4 flex flex-col gap-3">
        <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-[12px] mono">
          <Row k="project" v={p.project} />
          <Row k="scene" v={p.scene} />
          <Row k="lock timestamp" v={p.lock_timestamp} />
          <Row k="final world state" v={p.final_world_state} />
          <Row k="kms key version" v={p.kms_key_version} />
          <Row k="schema version" v={p.schema_version} />
          <Row k="certificate hash" v={`sha256:${p.certificate_hash}`} />
          <Row k="prior hash" v={p.prior_certificate_hash ? `sha256:${p.prior_certificate_hash}` : "— (genesis)"} />
          <Row k="verification slug" v={p.verification_slug} />
        </dl>
      </div>

      <div className="panel p-4">
        <div className="vmb-k mb-2">findings & adjudications</div>
        <ul className="flex flex-col gap-1 text-[12px] mono">
          {p.findings.map((line, i) => (
            <li key={i} className="text-[var(--color-text-secondary)]">
              · {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-4">
        <div className="vmb-k mb-2">evidence chain</div>
        <div className="text-[11px] mono text-[var(--color-text-secondary)] flex flex-col gap-1">
          <div>frames: {p.evidence_chain.frames.length}</div>
          <div>quotes: {p.evidence_chain.quotes.length}</div>
          <div>embedding versions: {p.evidence_chain.embedding_versions.join(", ") || "—"}</div>
          <div>C2PA manifests: {p.c2pa_manifests.length}</div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="vmb-k mb-2">hash chain (C-17)</div>
        <HashChainView chain={chain} currentHash={p.certificate_hash} />
      </div>

      <div
        className="panel p-4 text-[12px]"
        style={{ borderLeft: "3px solid var(--color-status-held)" }}
      >
        <div className="vmb-k mb-1">disclaimer (verbatim)</div>
        {p.disclaimer}
      </div>

      <Link
        href={`/verify/${p.verification_slug}`}
        className="mono text-[12px] text-[var(--color-source-deterministic)] underline self-start"
      >
        public verification page → /verify/{p.verification_slug}
      </Link>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[var(--color-text-secondary)]">{k}</dt>
      <dd className="break-all">{v}</dd>
    </>
  );
}
