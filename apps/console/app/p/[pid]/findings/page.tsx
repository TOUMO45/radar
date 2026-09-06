import { api } from "@/lib/api";
import { FindingInbox } from "@/components/FindingInbox";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/** S4 — Finding Inbox. Cross-scene triage list with adjudication/waiver (M1). */
export default async function FindingsPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const { findings } = await api.listFindings(pid);
  const blocking = findings.filter((f) => f.blocking && f.status === "open").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Review"
        title="Finding Inbox"
        sub="Every open issue across the production, most severe first. Confirm, waive, or open the dossier."
        backHref={`/p/${pid}`}
        backLabel={pid}
        status={blocking > 0 ? `${blocking} blocking` : "none blocking"}
        statusTone={blocking > 0 ? "error" : "locked"}
      />
      <FindingInbox findings={findings} />
    </div>
  );
}
