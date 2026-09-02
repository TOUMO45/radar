import type { SseEvent } from "@scenelock/schema";

/**
 * Event backbone seam (spec E.2). In-memory pub/sub now; a Pub/Sub adapter
 * implements the same interface later. Topics mirror the spec's topic table.
 */
export type Topic =
  | "shots.raw"
  | "shots.processed"
  | "gates.requested"
  | "gates.results"
  | "findings.events"
  | "verdict.events"
  | "loop.control"
  | "incidents.events"
  | "certificates.events"
  | "kg.events"
  | "system.events";

export interface EventEnvelope<T = unknown> {
  event_id: string;
  topic: Topic;
  ordering_key?: string;
  ts: string;
  payload: T;
}

export type Handler = (e: EventEnvelope) => void | Promise<void>;

export interface EventBusPort {
  publish<T>(topic: Topic, payload: T, opts?: { ordering_key?: string; event_id?: string }): Promise<void>;
  subscribe(topic: Topic, handler: Handler): () => void;
  /** stream of SSE-shaped events for the BFF channel (D.4) */
  onSse(handler: (e: SseEvent) => void): () => void;
  emitSse(e: SseEvent): void;
}

export class InMemoryEventBus implements EventBusPort {
  private handlers = new Map<Topic, Set<Handler>>();
  private sseHandlers = new Set<(e: SseEvent) => void>();
  private seq = 0;

  constructor(private now: () => string = () => new Date().toISOString()) {}

  async publish<T>(
    topic: Topic,
    payload: T,
    opts: { ordering_key?: string; event_id?: string } = {},
  ): Promise<void> {
    const env: EventEnvelope<T> = {
      event_id: opts.event_id ?? `evt_${++this.seq}`,
      topic,
      ordering_key: opts.ordering_key,
      ts: this.now(),
      payload,
    };
    const hs = this.handlers.get(topic);
    if (!hs) return;
    for (const h of hs) await h(env as EventEnvelope);
  }

  subscribe(topic: Topic, handler: Handler): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onSse(handler: (e: SseEvent) => void): () => void {
    this.sseHandlers.add(handler);
    return () => this.sseHandlers.delete(handler);
  }

  emitSse(e: SseEvent): void {
    for (const h of this.sseHandlers) h(e);
  }
}
