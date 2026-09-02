import { api } from "@/lib/api";
import { WarRoom } from "@/components/WarRoom";

export const dynamic = "force-dynamic";

/** S3 — Scene War Room ★ (the money screen). Data on the server; interaction + SSE in <WarRoom>. */
export default async function SceneWarRoomPage({
  params,
}: {
  params: Promise<{ pid: string; sid: string }>;
}) {
  const { pid, sid } = await params;
  const [scene, shots, verdict, findingsRes] = await Promise.all([
    api.getScene(sid),
    api.listShots(sid),
    api.getVerdict(sid),
    api.listFindings(pid, `scene=${sid}`),
  ]);

  return (
    <WarRoom
      pid={pid}
      scene={scene}
      shots={shots}
      verdict={verdict}
      findings={findingsRes.findings}
    />
  );
}
