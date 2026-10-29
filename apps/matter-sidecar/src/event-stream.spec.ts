import { EventStream } from './event-stream';
import { formatCursor } from '@attraccess/matter-contract';

function stream(maxEvents = 3, maxAgeMs = 1_000) {
  const clock = { now: 1_000_000 };
  return { clock, stream: new EventStream({ maxEvents, maxAgeMs, now: () => clock.now }) };
}
const publish = (s: EventStream, count = 1) =>
  Array.from({ length: count }, () => s.publish('device.state', { value: 1 }));

describe('EventStream', () => {
  it('assigns increasing sequence numbers, ids and timestamps once', () => {
    const { stream: s, clock } = stream(10);
    const [first, second] = publish(s, 2);
    expect(second.sequence).toBe(first.sequence + 1);
    expect(first.eventId).not.toBe(second.eventId);
    expect(first.streamInstanceId).toBe(s.streamInstanceId);
    expect(first.correlation.initiator).toEqual({ userId: null, requestId: null });
    clock.now += 100;
    const replay = s.replayAfter(formatCursor(s.streamInstanceId, 0));
    expect(replay).toEqual({ kind: 'replay', events: [first, second] });
    expect(s.headCursor).toBe(formatCursor(s.streamInstanceId, 2));
  });

  it('has no head cursor before the first event', () => {
    expect(stream().stream.headCursor).toBeNull();
  });

  it('replays only events after the cursor and nothing at the head', () => {
    const { stream: s } = stream(10);
    const events = publish(s, 3);
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 1))).toEqual({ kind: 'replay', events: events.slice(1) });
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 3))).toEqual({ kind: 'replay', events: [] });
  });

  it('answers reconciliation-required for malformed, foreign and future cursors', () => {
    const { stream: s } = stream(10);
    publish(s, 2);
    expect(s.replayAfter('nope')).toEqual({ kind: 'reconciliation-required', reason: 'malformed' });
    expect(s.replayAfter(formatCursor('11111111-1111-4111-8111-111111111111', 1))).toEqual({
      kind: 'reconciliation-required',
      reason: 'foreign-stream',
    });
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 99))).toEqual({
      kind: 'reconciliation-required',
      reason: 'future',
    });
  });

  it('evicts by count and reports evicted cursors', () => {
    const { stream: s } = stream(3);
    publish(s, 5);
    expect(s.size).toBe(3);
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 1))).toEqual({
      kind: 'reconciliation-required',
      reason: 'evicted',
    });
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 2))).toMatchObject({ kind: 'replay' });
  });

  it('expires by age, also while idle, and reports expired cursors', () => {
    const { stream: s, clock } = stream(10, 1_000);
    publish(s, 2);
    clock.now += 500;
    publish(s);
    clock.now += 600;
    s.prune();
    expect(s.size).toBe(1);
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 1))).toEqual({
      kind: 'reconciliation-required',
      reason: 'expired',
    });
    clock.now += 10_000;
    s.prune();
    expect(s.size).toBe(0);
    expect(s.replayAfter(formatCursor(s.streamInstanceId, 3))).toEqual({ kind: 'replay', events: [] });
  });

  it('notifies live subscribers until they unsubscribe', () => {
    const { stream: s } = stream(10);
    const seen: number[] = [];
    const stop = s.subscribe((event) => seen.push(event.sequence));
    publish(s);
    stop();
    publish(s);
    expect(seen).toEqual([1]);
  });

  it('uses a new stream instance per run', () => {
    expect(stream().stream.streamInstanceId).not.toBe(stream().stream.streamInstanceId);
  });
});
