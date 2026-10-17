import { randomUUID } from 'node:crypto';
import {
  Cursor,
  EventEnvelope,
  EventPayload,
  type MatterEvent,
  type NewEvent,
  type ResumeCursor,
} from '@attraccess/matter-contract';
import { ProtocolError } from './errors.js';

type Listener = (event: MatterEvent) => void;
export class EventStream {
  readonly instanceId = randomUUID();
  private sequence = 0;
  private discardedThrough = 0;
  private discardedReason: 'expired' | 'evicted' = 'evicted';
  private buffer: { event: MatterEvent; publishedAt: number }[] = [];
  private listeners = new Set<Listener>();
  private expirationTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  constructor(
    private readonly count = 1000,
    private readonly ageMs = 300000,
    private readonly now = Date.now,
  ) {}
  get watermark(): ResumeCursor {
    return { streamInstanceId: this.instanceId, sequence: this.sequence };
  }
  publish(
    input: NewEvent,
    correlation = { requestId: null as string | null, operationId: null as string | null },
  ): MatterEvent {
    if (this.disposed) throw new Error('Event stream is disposed.');
    EventPayload.parse(input);
    if (this.sequence >= Number.MAX_SAFE_INTEGER)
      throw new Error('Event sequence exhausted; restart with a new stream instance.');
    const event = EventEnvelope.parse({
      ...input,
      eventId: randomUUID(),
      schemaVersion: 1,
      timestamp: new Date(this.now()).toISOString(),
      correlation,
      streamInstanceId: this.instanceId,
      sequence: this.sequence + 1,
    });
    this.sequence++;
    this.buffer.push({ event, publishedAt: this.now() });
    this.prune();
    // Copies prevent an adapter/consumer mutating stable replay identity or payload.
    for (const listener of this.listeners) listener(structuredClone(event));
    return structuredClone(event);
  }
  private prune(): void {
    clearTimeout(this.expirationTimer);
    this.expirationTimer = undefined;
    while (
      this.buffer.length &&
      (this.buffer.length > this.count || this.now() - this.buffer[0].publishedAt >= this.ageMs)
    ) {
      this.discardedReason = this.now() - this.buffer[0].publishedAt >= this.ageMs ? 'expired' : 'evicted';
      this.discardedThrough = this.buffer[0].event.sequence;
      this.buffer.shift();
    }
    if (this.buffer.length) {
      const remainingMs = this.ageMs - (this.now() - this.buffer[0].publishedAt);
      this.expirationTimer = setTimeout(() => this.prune(), Math.max(1, remainingMs));
      this.expirationTimer.unref();
    }
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.expirationTimer);
    this.expirationTimer = undefined;
    this.buffer = [];
    this.listeners.clear();
  }
  reconcile(
    reason: 'malformed' | 'expired' | 'evicted' | 'future' | 'different_instance' | 'slow_client',
  ): ProtocolError {
    return new ProtocolError(
      'RECONCILIATION_REQUIRED',
      'Event stream cannot resume safely; authoritative recovery is unavailable in this foundation. Keep consumer state unreconciled.',
      {
        reconciliation: {
          reason,
          snapshotAvailable: false,
          action:
            'Keep consumer state unreconciled: authoritative snapshots are unavailable in this foundation. Do not silently advance the cursor or retry physical commands.',
        },
      },
    );
  }
  // No awaits: replay and subscription registration are atomic on the Node event loop.
  resume(
    cursor: ResumeCursor | null,
    listener: Listener,
  ): { replay: MatterEvent[]; watermark: ResumeCursor; unsubscribe: () => void } {
    if (this.disposed) throw new Error('Event stream is disposed.');
    this.prune();
    let after = this.sequence;
    if (cursor !== null) {
      const parsed = Cursor.safeParse(cursor);
      if (!parsed.success) throw this.reconcile('malformed');
      if (cursor.streamInstanceId !== this.instanceId) throw this.reconcile('different_instance');
      if (cursor.sequence > this.sequence) throw this.reconcile('future');
      if (cursor.sequence < this.discardedThrough) throw this.reconcile(this.discardedReason);
      after = cursor.sequence;
    }
    const replay = this.buffer.filter(({ event }) => event.sequence > after).map(({ event }) => structuredClone(event));
    this.listeners.add(listener);
    return {
      replay,
      watermark: this.watermark,
      unsubscribe: () => {
        this.listeners.delete(listener);
      },
    };
  }
}
