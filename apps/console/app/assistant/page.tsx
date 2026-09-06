import { AssistantPanel } from "@/components/AssistantPanel";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Ask the production (FEATURE 6) — a grounded, read-only Q&A over a
 * production's real RADAR findings. The grounding is fetched server-side
 * before the model is called; the assistant holds zero tools and cannot
 * change a verdict.
 */
export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-5 max-w-[880px]">
      <PageHeader
        eyebrow="Assistant"
        title="Ask the production"
        sub="Grounded in this production's findings. Read-only by design."
        status="gemini · vertex ai"
        statusTone="model"
      />
      <AssistantPanel />
    </div>
  );
}
