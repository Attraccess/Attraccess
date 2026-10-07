import { describe, expect, it, vi } from 'vitest';
import { LiveSubscription } from '@attraccess/shared';
import { flush, useLiveClientFixture } from './live-update-client.test-fixture';

describe('bundled live client', () => {
  const fixture = useLiveClientFixture();

  it.each(['same', 'different'])('retains the connection across a %s-topic replacement in one batch', async (kind) => {
    const departed = vi.fn();
    const remove = fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, departed);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'started', payload: { inUse: true } },
    });
    await flush();
    const replacement = vi.fn();
    remove();
    const subscription: LiveSubscription =
      kind === 'same' ? { topic: 'resource' as const, resourceId: 1 } : { topic: 'billing' as const };
    const removeReplacement = fixture.client.subscribe(subscription, replacement);
    remove();
    await flush();
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.streams[0].signal?.aborted).toBe(false);
    expect(fixture.controls.at(-1)?.subscriptions).toEqual([subscription]);
    expect(departed).toHaveBeenCalledTimes(1);
    if (kind === 'same') expect(replacement).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: true });
    removeReplacement();
    await flush();
    expect(fixture.streams[0].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replays resource state only to a late consumer without replaying usage actions or erasing it on health events', async () => {
    const first = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false, timestamp: 'initial' } },
    });
    await flush();
    const second = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, second);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: false, timestamp: 'initial' });
    fixture.streams[0].send({
      type: 'event',
      event: {
        topic: 'resource',
        resourceId: 1,
        eventType: 'started',
        payload: { inUse: true, resourceId: 99, eventType: 'started', usage: { id: 5 } },
      },
    });
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'health', payload: { status: 'unavailable' } },
    });
    await flush();
    const late = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, late);
    await flush();
    expect(late).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: true });
    expect(first).toHaveBeenCalledTimes(3);
    expect(fixture.controls).toHaveLength(1);
  });

  it('replays in-use state to a consumer that joins during a health-only callback', async () => {
    const late = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, (payload) => {
      if (payload && typeof payload === 'object' && 'status' in payload) {
        fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, late);
      }
    });
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'health', payload: { status: 'unavailable' } },
    });
    await flush();
    expect(late.mock.calls).toEqual([[{ status: 'unavailable' }], [{ resourceId: 1, inUse: true }]]);
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.controls).toHaveLength(1);
  });

  it('shares pending initial state and cancels replay on removal, resource change or a newer live packet', async () => {
    const first = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    const waiting = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, waiting);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false } },
    });
    await flush();
    expect(waiting).toHaveBeenCalledExactlyOnceWith({ inUse: false });
    const removed = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, removed)();
    const otherResource = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 2 }, otherResource);
    await flush();
    expect(removed).not.toHaveBeenCalled();
    expect(otherResource).not.toHaveBeenCalled();

    // Register during live delivery: its queued replay must lose to that live packet.
    const joined = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, () => {
      fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, joined);
    });
    await flush();
    joined.mockClear();
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'ended', payload: { inUse: true } },
    });
    await flush();
    expect(joined).toHaveBeenCalledTimes(2); // Two registered consumers, each gets only the live event.
    expect(joined.mock.calls.every(([value]) => value.inUse === true)).toBe(true);
  });

  it('clears snapshots on rejection, retries a rejected shared topic on join and clears them on disconnect', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    fixture.streams[0].send({
      type: 'rejected',
      subscription: { topic: 'resource', resourceId: 1 },
      reason: 'Forbidden',
    });
    await flush();
    const late = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, late);
    await flush();
    expect(late).not.toHaveBeenCalled();
    expect(fixture.controls).toHaveLength(2);
    fixture.streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false } },
    });
    await flush();
    fixture.streams[0].end();
    await flush();
    const afterDisconnect = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, afterDisconnect);
    await flush();
    expect(afterDisconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    fixture.streams[1].send({ type: 'ready' });
    fixture.streams[1].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    expect(afterDisconnect).toHaveBeenCalledExactlyOnceWith({ inUse: true });
  });

  it('ignores malformed rejection subscriptions without interrupting valid delivery', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const update = vi.fn();
    fixture.client.subscribe({ topic: 'billing' }, update);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    for (const subscription of [null, 'billing', {}, { topic: 1 }]) {
      fixture.streams[0].send({ type: 'rejected', subscription, reason: 'Invalid topic' });
      await flush();
    }
    fixture.streams[0].send({ type: 'event', event: { topic: 'billing', eventType: 'update', payload: { id: 7 } } });
    await flush();
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7 });
    expect(fixture.streams[0].signal?.aborted).toBe(false);
    expect(fixture.streams).toHaveLength(1);
  });

  it('does not replay non-resource topics or resource state from a genuinely removed topic', async () => {
    fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    const remove = fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    const subscriptions: LiveSubscription[] = [{ topic: 'resource', resourceId: 1 }, { topic: 'billing' }];
    for (const subscription of subscriptions) {
      fixture.streams[0].send({
        type: 'event',
        event: { ...subscription, eventType: 'update', payload: { inUse: true } },
      });
    }
    await flush();
    const billing = vi.fn();
    fixture.client.subscribe({ topic: 'billing' }, billing);
    remove();
    await flush();
    const resource = vi.fn();
    fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, resource);
    await flush();
    expect(billing).not.toHaveBeenCalled();
    expect(resource).not.toHaveBeenCalled();
  });
});
