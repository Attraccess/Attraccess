import { describe, expect, it, vi } from 'vitest';
import { LivePacket } from '@attraccess/shared';
import { flush, useLiveClientFixture } from './client.test-fixture';

describe('bundled live client', () => {
  const fixture = useLiveClientFixture();

  it('shares plugin topics with core, reference-counts duplicates and routes namespaces/identifiers independently', async () => {
    const first = vi.fn(),
      second = vi.fn(),
      otherDevice = vi.fn(),
      otherPlugin = vi.fn();
    const subscription = { topic: 'plugin:wago:diagnostics', identifier: '1' } as const;
    const remove = fixture.client.subscribe(subscription, first);
    const removeSecond = fixture.client.subscribe(subscription, second);
    fixture.client.subscribe({ ...subscription, identifier: '2' }, otherDevice);
    fixture.client.subscribe({ topic: 'plugin:shelly:diagnostics', identifier: '1' }, otherPlugin);
    fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.controls.at(-1)?.subscriptions).toHaveLength(4);
    const event: LivePacket = {
      type: 'event',
      event: { ...subscription, eventType: 'snapshot', payload: { value: 7 } },
    };
    fixture.streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(otherDevice).not.toHaveBeenCalled();
    expect(otherPlugin).not.toHaveBeenCalled();
    remove();
    remove();
    fixture.streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    removeSecond();
    await flush();
    expect(fixture.controls.at(-1)?.subscriptions).not.toContainEqual(subscription);
    expect(fixture.streams).toHaveLength(1);
  });

  it('uses one stream for all six types and ten resources; references duplicates and keeps unrelated topics alive', async () => {
    const first = vi.fn(),
      second = vi.fn();
    const remove = fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    const removeSecond = fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, second);
    for (let resourceId = 2; resourceId <= 10; resourceId++)
      fixture.client.subscribe({ topic: 'resource', resourceId }, vi.fn());
    fixture.client.subscribe({ topic: 'flow-logs', resourceId: 1 }, vi.fn());
    for (const topic of ['billing', 'messaging', 'notifications', 'supervision'] as const)
      fixture.client.subscribe({ topic }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.controls.at(-1)?.subscriptions).toHaveLength(15);
    const event: LivePacket = {
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    };
    fixture.streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    remove();
    remove();
    fixture.streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    removeSecond();
    await flush();
    expect(fixture.controls.at(-1)?.subscriptions).not.toContainEqual({ topic: 'resource', resourceId: 1 });
    expect(fixture.streams).toHaveLength(1);
  });

  it('opens a valid connection when plain HTTP provides getRandomValues but no randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(() => fixture.client.subscribe({ topic: 'billing' }, vi.fn())).not.toThrow();
    await flush();
    expect(fixture.streams).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /\/live-updates\/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\/events$/,
    );
  });

  it('reports visibility changes through the existing transport and removes the listener on final cleanup', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const remove = fixture.client.subscribe({ topic: 'notifications' }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    expect(fixture.controls.at(-1)?.present).toBe(true);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fixture.controls.at(-1)?.present).toBe(false);
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.controls).toHaveLength(2);
    remove();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fixture.controls).toHaveLength(2);
  });

  it('isolates callbacks, routes by topic and resource, ignores controls and cancels final consumers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const callback = vi.fn(),
      wrongResource = vi.fn();
    const fail = fixture.client.subscribe({ topic: 'messaging' }, () => {
      throw new Error('failure');
    });
    const asyncFail = fixture.client.subscribe({ topic: 'messaging' }, async () => {
      throw new Error('async failure');
    });
    const remove = fixture.client.subscribe({ topic: 'messaging' }, callback);
    const wrong = fixture.client.subscribe({ topic: 'resource', resourceId: 1 }, wrongResource);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({ type: 'heartbeat' });
    fixture.streams[0].send({ type: 'event', event: { topic: 'messaging', eventType: 'update', payload: { id: 5 } } });
    await flush();
    expect(callback).toHaveBeenCalledExactlyOnceWith({ id: 5 });
    expect(wrongResource).not.toHaveBeenCalled();
    fail();
    asyncFail();
    remove();
    wrong();
    await flush();
    // Subsequent stale cleanup cannot close a replacement transport.
    const replacement = fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    fail();
    asyncFail();
    remove();
    wrong();
    await flush();
    expect(fixture.streams).toHaveLength(2);
    replacement();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.streams).toHaveLength(2);
  });
});
