import { describe, expect, it, vi } from 'vitest';
import { flush, useLiveClientFixture } from './client.test-fixture';

describe('bundled live client', () => {
  const fixture = useLiveClientFixture();

  it('recovers only an explicit same-user session change through bounded reconnect without expiring', async () => {
    fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    fixture.client.subscribe({ topic: 'plugin:wago:diagnostics', identifier: '1' }, vi.fn());
    const remove = fixture.client.subscribe({ topic: 'resource', resourceId: 2 }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
    );
    document.dispatchEvent(new Event('visibilitychange')); // No notification consumer: no control.
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(fixture.streams[0].signal?.aborted).toBe(true);
    expect(fixture.expired).not.toHaveBeenCalled();
    remove();
    await vi.advanceTimersByTimeAsync(501);
    expect(fixture.streams).toHaveLength(2);
    expect(fixture.streams[1].url).not.toBe(fixture.streams[0].url);
    fixture.streams[1].send({ type: 'ready' });
    await flush();
    expect(fixture.controls.at(-1)?.subscriptions).toEqual([
      { topic: 'billing' },
      { topic: 'plugin:wago:diagnostics', identifier: '1' },
    ]);
    expect(fixture.recovered).toHaveBeenCalledTimes(1);
  });

  it.each(['not json', '{}', '{"code":"UNKNOWN"}', '{"code":"LIVE_UPDATES_SESSION_CHANGED","unused":1}'])(
    'distinguishes control 403 body %s',
    async (body) => {
      fixture.client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 403 }));
      fixture.streams[0].send({ type: 'ready' });
      await flush();
      expect(fixture.expired).toHaveBeenCalledTimes(body.includes('LIVE_UPDATES_SESSION_CHANGED') ? 0 : 1);
    },
  );

  it.each(['UNKNOWN', 'LIVE_UPDATES_SESSION_CHANGED'])(
    'checks transport ownership again after reading a late %s error body',
    async (code) => {
      let resolve!: (value: unknown) => void;
      const json = new Promise((r) => {
        resolve = r;
      });
      const response = new Response(null, { status: 403 });
      vi.spyOn(response, 'json').mockReturnValue(json);
      const remove = fixture.client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      vi.mocked(fetch).mockResolvedValueOnce(response);
      fixture.streams[0].send({ type: 'ready' });
      await flush();
      remove();
      await flush();
      fixture.client.subscribe({ topic: 'messaging' }, vi.fn());
      await flush();
      fixture.streams[1].send({ type: 'ready' });
      await flush();
      resolve({ code });
      await flush();
      expect(fixture.expired).not.toHaveBeenCalled();
      expect(fixture.streams[1].signal?.aborted).toBe(false);
    },
  );

  it('caps repeated session recovery attempts and cancels final unsubscribe during recovery backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const remove = fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    for (const delay of [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
      );
      fixture.streams.at(-1)?.send({ type: 'ready' });
      await flush();
      const count = fixture.streams.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fixture.streams).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(fixture.streams).toHaveLength(count + 1);
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
    );
    fixture.streams.at(-1)?.send({ type: 'ready' });
    await flush();
    remove();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    const count = fixture.streams.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixture.streams).toHaveLength(count);
    expect(fixture.expired).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'expires stream authentication with status %s even if its body claims recovery',
    async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status }),
      );
      fixture.client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      expect(fixture.expired).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
