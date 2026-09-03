import type { QuickScanResult } from "@scenelock/schema";

/**
 * Shareable Quick Scan report store (additive — Feature 3).
 *
 * A Quick Scan was fully stateless (services/quickscan/src/index.ts is a pure
 * function). This keeps each result under a strong random id so it can be
 * re-opened read-only via GET /v1/quickscan/:scanId.
 *
 * Process-local and bounded — the same seam class as the in-memory storage /
 * event bus / rate-limiter in this codebase. It clears on a cold start and is
 * not shared across instances; `radar-api` is pinned to a single Cloud Run
 * instance for the demo so a POST and its follow-up GET hit the same process.
 * The real backend is Firestore (the project already has a `radar` db) behind
 * this same tiny interface.
 */

const MAX_ENTRIES = 500;
const store = new Map<string, QuickScanResult>();

export function putScan(scanId: string, result: QuickScanResult): void {
  // bounded FIFO — evict the oldest when full
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(scanId, result);
}

export function getScan(scanId: string): QuickScanResult | null {
  return store.get(scanId) ?? null;
}
