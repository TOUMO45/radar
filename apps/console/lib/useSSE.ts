"use client";

import { useEffect, useRef } from "react";

type Handler = (type: string, data: unknown) => void;

/**
 * Native EventSource with Last-Event-ID reconnect (D.4, D10). One channel per
 * production; the handler decides what to patch/refresh.
 */
export function useSSE(pid: string | null, onEvent: Handler) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!pid) return;
    const es = new EventSource(`/api/stream/${pid}`);
    const known = [
      "finding.created",
      "finding.updated",
      "verdict.changed",
      "shot.status",
      "loop.attempt",
      "worldstate.updated",
      "system.degraded",
      "cost.updated",
      "certificate.signed",
      "demo.act",
      "heartbeat",
    ];
    const listeners = known.map((type) => {
      const fn = (e: MessageEvent) => {
        let data: unknown = null;
        try {
          data = JSON.parse(e.data);
        } catch {
          data = e.data;
        }
        cb.current(type, data);
      };
      es.addEventListener(type, fn as EventListener);
      return [type, fn] as const;
    });
    return () => {
      for (const [type, fn] of listeners) es.removeEventListener(type, fn as EventListener);
      es.close();
    };
  }, [pid]);
}
