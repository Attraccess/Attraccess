import { describe, it, expect, vi } from 'vitest';
import { EventStream } from './stream.js';

const event = { type: 'lifecycle', payload: { state: 'ready' } } as const;
describe('bounded event resume', () => {
  it('removes expired events while idle and cancels cleanup on disposal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const stream = new EventStream(10, 100);
    try {
      stream.publish(event);
      vi.advanceTimersByTime(50);
      stream.publish(event);
      vi.advanceTimersByTime(50);
      // Inspect physical retention before any publish/resume can prune it.
      expect(Reflect.get(stream, 'buffer')).toHaveLength(1);
      vi.advanceTimersByTime(50);
      expect(Reflect.get(stream, 'buffer')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      stream.publish(event);
      expect(vi.getTimerCount()).toBe(1);
      stream.dispose();
      stream.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(Reflect.get(stream, 'buffer')).toHaveLength(0);
      expect(() => stream.publish(event)).toThrow('disposed');
      expect(() => stream.resume(null, () => undefined)).toThrow('disposed');
    } finally {
      vi.useRealTimers();
    }
  });
  it('preserves IDs, metadata and order across repeated replay and live subscription', () => {
    const stream = new EventStream();
    const start = stream.watermark;
    const first = stream.publish(event);
    const second = stream.publish(event);
    const live: unknown[] = [];
    const resumed = stream.resume(start, (next) => live.push(next));
    expect(resumed.replay).toEqual([first, second]);
    expect(stream.resume(start, () => undefined).replay).toEqual([first, second]);
    const third = stream.publish(event);
    expect(live).toEqual([third]);
    expect(third.sequence).toBe(second.sequence + 1);
    resumed.unsubscribe();
    stream.publish(event);
    expect(live).toHaveLength(1);
  });
  it('prevents mutations changing replay and uses an explicit watermark for fresh subscriptions', () => {
    const stream = new EventStream();
    const cursor = stream.watermark;
    const published = stream.publish(event);
    published.eventId = 'invalid';
    expect(stream.resume(cursor, () => undefined).replay[0].eventId).not.toBe('invalid');
    const fresh = stream.resume(null, () => undefined);
    expect(fresh.replay).toEqual([]);
    expect(fresh.watermark.sequence).toBe(1);
  });
  it.each(['malformed', 'expired', 'evicted', 'future', 'different_instance', 'slow_client'] as const)(
    'keeps consumers unreconciled when recovery is unavailable: %s',
    (reason) => {
      const stream = new EventStream();
      const error = stream.reconcile(reason).envelope('11111111-1111-4111-8111-111111111111').error;
      expect(error.message).toContain('authoritative recovery is unavailable');
      expect(error.retryable).toBe(false);
      expect(error.details.reconciliation).toEqual({
        reason,
        snapshotAvailable: false,
        action:
          'Keep consumer state unreconciled: authoritative snapshots are unavailable in this foundation. Do not silently advance the cursor or retry physical commands.',
      });
    },
  );
  it('rejects evicted, expired, future, malformed and previous-process cursors', () => {
    let now = 0;
    const stream = new EventStream(1, 100, () => now);
    const start = stream.watermark;
    stream.publish(event);
    const first = stream.watermark;
    stream.publish(event);
    expect(() => stream.resume(start, () => undefined)).toThrow('reconcile');
    expect(stream.resume(first, () => undefined).replay).toHaveLength(1);
    now = 100;
    expect(() => stream.resume(first, () => undefined)).toThrow('reconcile');
    expect(() => stream.resume({ ...start, sequence: 1000 }, () => undefined)).toThrow('reconcile');
    expect(() => new EventStream().resume(stream.watermark, () => undefined)).toThrow('reconcile');
    expect(() => stream.resume({ ...start, sequence: -1 }, () => undefined)).toThrow('reconcile');
    expect(stream.resume(stream.watermark, () => undefined).replay).toEqual([]);
  });
});
