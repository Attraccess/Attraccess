import {
  EVENT_SCHEMA_VERSION,
  formatCursor,
  parseCursor,
  type Correlation,
  type EventEnvelope,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';

export type ReconciliationReason = 'malformed' | 'expired' | 'evicted' | 'future' | 'foreign-stream';
export type ReplayResult =
  { kind: 'replay'; events: EventEnvelope[] } | { kind: 'reconciliation-required'; reason: ReconciliationReason };

export type StreamOptions = {
  maxEvents: number;
  maxAgeMs: number;
  now?: () => number;
  streamInstanceId?: string;
};

const SIDECAR_INITIATOR = { userId: null, requestId: null } as const;

export function sidecarCorrelation(): Correlation {
  return { correlationId: randomUUID(), causationId: null, initiator: { ...SIDECAR_INITIATOR } };
}

/**
 * One ordered, bounded, in-memory stream per sidecar run. Ordering is guaranteed only within one run (the stream
 * instance ID changes on restart). Delivery is at least once; consumers drop duplicates by event ID.
 */
export class EventStream {
  readonly streamInstanceId: string;
  private readonly now: () => number;
  private readonly buffer: { event: EventEnvelope; publishedAt: number }[] = [];
  private readonly listeners = new Set<(event: EventEnvelope) => void>();
  private sequence = 0;
  private expiredThrough = 0;
  private evictedThrough = 0;

  constructor(private readonly options: StreamOptions) {
    this.streamInstanceId = options.streamInstanceId ?? randomUUID();
    this.now = options.now ?? Date.now;
  }

  get headSequence(): number {
    return this.sequence;
  }

  get headCursor(): string | null {
    return this.sequence === 0 ? null : formatCursor(this.streamInstanceId, this.sequence);
  }

  get size(): number {
    return this.buffer.length;
  }

  /** ID, timestamp and sequence are assigned here, once, and never change on replay. */
  publish(
    type: EventEnvelope['type'],
    payload: EventEnvelope['payload'],
    correlation = sidecarCorrelation(),
  ): EventEnvelope {
    const publishedAt = this.now();
    this.sequence += 1;
    const event: EventEnvelope = {
      eventId: randomUUID(),
      schemaVersion: EVENT_SCHEMA_VERSION,
      type,
      timestamp: new Date(publishedAt).toISOString(),
      correlation,
      streamInstanceId: this.streamInstanceId,
      sequence: this.sequence,
      payload,
    };
    this.buffer.push({ event, publishedAt });
    this.prune();
    for (const listener of [...this.listeners]) listener(event);
    return event;
  }

  /** Drops events beyond the count or age bound. Also called on an idle timer so quiet streams release memory. */
  prune(): void {
    const oldest = this.now() - this.options.maxAgeMs;
    while (this.buffer.length > 0 && this.buffer[0].publishedAt < oldest) {
      this.expiredThrough = this.buffer.shift()?.event.sequence ?? this.expiredThrough;
    }
    while (this.buffer.length > this.options.maxEvents) {
      this.evictedThrough = this.buffer.shift()?.event.sequence ?? this.evictedThrough;
    }
  }

  /** Events after `cursor`, or the reason replay is impossible. No snapshot exists yet, so none is offered. */
  replayAfter(cursor: string): ReplayResult {
    this.prune();
    const parsed = parseCursor(cursor);
    if (!parsed) return { kind: 'reconciliation-required', reason: 'malformed' };
    if (parsed.streamInstanceId !== this.streamInstanceId)
      return { kind: 'reconciliation-required', reason: 'foreign-stream' };
    if (parsed.sequence > this.sequence) return { kind: 'reconciliation-required', reason: 'future' };
    const missing = parsed.sequence + 1;
    if (missing <= this.expiredThrough) return { kind: 'reconciliation-required', reason: 'expired' };
    if (missing <= this.evictedThrough) return { kind: 'reconciliation-required', reason: 'evicted' };
    return {
      kind: 'replay',
      events: this.buffer.map((entry) => entry.event).filter((event) => event.sequence > parsed.sequence),
    };
  }

  /** Registers a live listener. Call in the same tick as `replayAfter` so no event is missed or duplicated. */
  subscribe(listener: (event: EventEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
