"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSSE } from "@/lib/useSSE";

/**
 * C-21 DegradedBanner — amber strip whenever a dependency is degraded (E.9).
 * Names the component + mode. A banner, never a toast (UX principle 5).
 * Also surfaces the demo-spine act markers so a live run reads as one story.
 */
export function DegradedBanner({ pid }: { pid: string }) {
  const router = useRouter();
  const [degraded, setDegraded] = useState<{ component: string; mode: string } | null>(null);
  const [act, setAct] = useState<{ title: string; note: string } | null>(null);

  useSSE(pid, (type, data) => {
    if (type === "system.degraded") {
      const d = data as { component: string; mode: string };
      setDegraded(d.mode === "resumed" ? null : d);
      router.refresh();
    }
    if (type === "demo.act") {
      const d = data as { title: string; note: string };
      setAct(d);
      router.refresh();
    }
  });

  useEffect(() => {
    if (!act) return;
    const id = setTimeout(() => setAct(null), 6000);
    return () => clearTimeout(id);
  }, [act]);

  if (!degraded && !act) return null;

  return (
    <div className="flex flex-col">
      {degraded && (
        <div
          className="px-4 py-2 mono text-[12px]"
          style={{ background: "rgba(255,178,36,0.12)", borderBottom: "1px solid var(--color-status-held)", color: "var(--color-status-held)" }}
        >
          DEGRADED — {degraded.component} in {degraded.mode} mode. Gates run reference-only; τ raised.
        </div>
      )}
      {act && (
        <div
          className="px-4 py-2 mono text-[12px]"
          style={{ background: "var(--color-bg-raise)", borderBottom: "1px solid var(--color-line-hair)", color: "var(--color-source-deterministic)" }}
        >
          ▸ {act.title}
          {act.note ? <span className="text-[var(--color-text-secondary)]"> — {act.note}</span> : null}
        </div>
      )}
    </div>
  );
}
