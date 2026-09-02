"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Finding, Scene } from "@scenelock/schema";
import { clientFetch } from "@/lib/client";

interface Item {
  label: string;
  hint: string;
  href: string;
}

/** ⌘K / Ctrl-K command palette — jump to a finding, shot, scene, or screen (C.4). */
export function CommandPalette({ pid }: { pid: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    const nav: Item[] = [
      { label: "Production Overview", hint: "screen", href: `/p/${pid}` },
      { label: "Finding Inbox", hint: "screen", href: `/p/${pid}/findings` },
      { label: "Loop Monitor", hint: "screen", href: `/p/${pid}/loop` },
      { label: "World State", hint: "screen", href: `/p/${pid}/world` },
      { label: "Consent Registry", hint: "screen", href: `/p/${pid}/consent` },
      { label: "SceneBench", hint: "screen", href: `/bench` },
    ];
    setItems(nav);
    Promise.all([
      clientFetch<{ scenes: Scene[] }>(`v1/productions/${pid}/scenes`).catch(() => ({ scenes: [] })),
      clientFetch<{ findings: Finding[] }>(`v1/productions/${pid}/findings`).catch(() => ({ findings: [] })),
    ]).then(([s, f]) => {
      setItems([
        ...nav,
        ...s.scenes.map((x) => ({ label: x.heading || x.scene_id, hint: `scene ${x.scene_id}`, href: `/p/${pid}/scenes/${x.scene_id}` })),
        ...f.findings.map((x) => ({
          label: x.description.slice(0, 60),
          hint: `${x.risk_class} · ${x.shot_id ?? "—"}`,
          href: `/p/${pid}/scenes/${x.scene_id}`,
        })),
      ]);
    });
  }, [open, pid]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n
      ? items.filter((i) => (i.label + " " + i.hint).toLowerCase().includes(n))
      : items;
    return list.slice(0, 20);
  }, [items, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-[560px] max-w-[92vw] panel overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, filtered.length - 1));
            else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter" && filtered[sel]) {
              setOpen(false);
              router.push(filtered[sel]!.href);
            }
          }}
          placeholder="jump to finding / shot / scene / screen…"
          className="w-full bg-transparent border-b px-4 py-3 mono text-[13px] outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {filtered.map((i, idx) => (
            <button
              key={idx}
              onClick={() => {
                setOpen(false);
                router.push(i.href);
              }}
              className="w-full text-left px-4 py-2 border-b last:border-b-0 flex items-center gap-3"
              style={{ background: idx === sel ? "var(--color-bg-raise)" : undefined }}
            >
              <span className="text-[13px] flex-1 truncate">{i.label}</span>
              <span className="mono text-[10px] text-[var(--color-text-secondary)]">{i.hint}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-[var(--color-text-secondary)] text-[12px]">no matches</div>
          )}
        </div>
      </div>
    </div>
  );
}
