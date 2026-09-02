import Link from "next/link";
import { api } from "@/lib/api";
import { FindingInbox } from "@/components/FindingInbox";

export const dynamic = "force-dynamic";

/** S4 — Finding Inbox. Cross-scene triage list with adjudication/waiver (M1). */
export default async function FindingsPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const { findings } = await api.listFindings(pid);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <Link href={`/p/${pid}`} className="mono text-[12px] text-[var(--color-source-deterministic)]">
          ← {pid}
        </Link>
        <h1 className="text-[18px] font-medium">Finding Inbox</h1>
      </div>
      <FindingInbox findings={findings} />
    </div>
  );
}
