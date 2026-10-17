import { describe, expect, it, vi } from 'vitest';
import { flush, useLiveClientFixture } from './client.test-fixture';

describe('bundled live client', () => {
  const fixture = useLiveClientFixture();

  it.each([false, true])(
    'keeps new topics unavailable until replacement readiness (previously ready: %s)',
    async (ready) => {
      fixture.client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      if (ready) {
        fixture.streams[0].send({ type: 'ready' });
        await flush();
      }
      fixture.streams[0].end();
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      expect(fixture.streams).toHaveLength(2);
      const subscription = { topic: 'plugin:wago:diagnostics', identifier: '2' } as const;
      const unavailable = vi.fn();
      const update = vi.fn();
      fixture.client.subscribe(subscription, update, undefined, unavailable);
      await flush();
      expect(unavailable).toHaveBeenCalledTimes(1);
      // A second failed attempt is still the same outage.
      fixture.streams[1].end();
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      expect(unavailable).toHaveBeenCalledTimes(1);
      fixture.streams[2].send({ type: 'ready' });
      await flush();
      expect(fixture.controls.at(-1)?.subscriptions).toEqual([{ topic: 'billing' }, subscription]);
      const healthy = vi.fn();
      fixture.client.subscribe({ ...subscription, identifier: '3' }, vi.fn(), undefined, healthy);
      await flush();
      expect(healthy).not.toHaveBeenCalled();
      fixture.streams[2].send({
        type: 'event',
        event: { ...subscription, eventType: 'snapshot', payload: { value: 8 } },
      });
      await flush();
      expect(update).toHaveBeenCalledWith({ value: 8 });
      fixture.streams[2].end();
      await flush();
      expect(unavailable).toHaveBeenCalledTimes(2);
      expect(healthy).toHaveBeenCalledTimes(1);
    },
  );

  it('clears outage state after final unsubscribe before a new connection', async () => {
    const remove = fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    fixture.streams[0].end();
    await flush();
    remove();
    await flush();
    const unavailable = vi.fn();
    fixture.client.subscribe({ topic: 'plugin:wago:diagnostics', identifier: '2' }, vi.fn(), undefined, unavailable);
    await flush();
    expect(fixture.streams).toHaveLength(2);
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('reports rejection only to matching consumers, including late subscribers', async () => {
    const diagnostics = { topic: 'plugin:wago:diagnostics', identifier: '1' } as const;
    const first = vi.fn();
    const second = vi.fn();
    const neighbor = vi.fn();
    fixture.client.subscribe(diagnostics, vi.fn(), undefined, first);
    fixture.client.subscribe(diagnostics, vi.fn(), undefined, second);
    fixture.client.subscribe({ ...diagnostics, identifier: '2' }, vi.fn(), undefined, neighbor);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].send({ type: 'rejected', subscription: diagnostics, reason: 'Forbidden' });
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(neighbor).not.toHaveBeenCalled();
    const late = vi.fn();
    fixture.client.subscribe(diagnostics, vi.fn(), undefined, late);
    const aborted = vi.fn();
    fixture.client.subscribe(diagnostics, vi.fn(), undefined, aborted)();
    await flush();
    expect(late).toHaveBeenCalledTimes(1);
    expect(aborted).not.toHaveBeenCalled();
    fixture.streams[0].send({ type: 'event', event: { ...diagnostics, eventType: 'snapshot', payload: { value: 8 } } });
    await flush();
    fixture.streams[0].send({ type: 'rejected', subscription: diagnostics, reason: 'Source failed' });
    await flush();
    expect(first).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenCalledTimes(2);
    expect(neighbor).not.toHaveBeenCalled();
  });

  it('reports interruption once per outage, restores active topics and ignores disposal', async () => {
    const unavailable = vi.fn();
    const removed = vi.fn();
    const restored = vi.fn();
    const subscription = { topic: 'plugin:wago:diagnostics', identifier: '1' } as const;
    fixture.client.subscribe(subscription, vi.fn(), restored, unavailable);
    fixture.client.subscribe({ topic: 'billing' }, vi.fn(), undefined, removed)();
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].end();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    const late = vi.fn();
    fixture.client.subscribe(subscription, vi.fn(), undefined, late);
    await flush();
    expect(late).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    fixture.streams[1].end();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    fixture.streams[2].send({ type: 'ready' });
    await flush();
    expect(restored).toHaveBeenCalledTimes(1);
    expect(fixture.controls.at(-1)?.subscriptions).toEqual([subscription]);
    fixture.streams[2].send({
      type: 'event',
      event: { ...subscription, eventType: 'snapshot', payload: { value: 8 } },
    });
    await flush();
    fixture.streams[2].end();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(2);
    fixture.client.dispose();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it('isolates unavailable callback failures and guards cleanup during delivery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = vi.fn(() => Promise.reject(new Error('consumer failed')));
    const good = vi.fn();
    const aborted = vi.fn();
    const subscription = { topic: 'plugin:wago:diagnostics', identifier: '1' } as const;
    let remove: () => void = () => undefined;
    fixture.client.subscribe(subscription, vi.fn(), undefined, () => {
      remove();
      throw new Error('sync failed');
    });
    fixture.client.subscribe(subscription, vi.fn(), undefined, failed);
    fixture.client.subscribe(subscription, vi.fn(), undefined, good);
    remove = fixture.client.subscribe(subscription, vi.fn(), undefined, aborted);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].send({ type: 'rejected', subscription, reason: 'Forbidden' });
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(aborted).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
