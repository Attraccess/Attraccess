import { describe, expect, it, vi } from 'vitest';
import { flush, useLiveClientFixture } from './live-update-client.test-fixture';

describe('bundled live client', () => {
  const fixture = useLiveClientFixture();

  it('clears recovered outage state for quiet topics and reports the next outage', async () => {
    const unavailable = vi.fn();
    fixture.client.subscribe({ topic: 'billing' }, vi.fn(), undefined, unavailable);
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].end();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(501);
    fixture.streams[1].send({ type: 'ready' });
    await flush();
    const lateUnavailable = vi.fn();
    fixture.client.subscribe({ topic: 'billing' }, vi.fn(), undefined, lateUnavailable);
    await flush();
    expect(lateUnavailable).not.toHaveBeenCalled();
    fixture.streams[1].end();
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(2);
    expect(lateUnavailable).toHaveBeenCalledTimes(1);
  });

  it('keeps rejected topics unavailable when the transport recovers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    fixture.streams[0].send({ type: 'rejected', subscription: { topic: 'billing' }, reason: 'Forbidden' });
    await flush();
    fixture.streams[0].end();
    await flush();
    await vi.advanceTimersByTimeAsync(501);
    fixture.streams[1].send({ type: 'ready' });
    await flush();
    const unavailable = vi.fn();
    fixture.client.subscribe({ topic: 'billing' }, vi.fn(), undefined, unavailable);
    await flush();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('restores only active topics after interruption and refreshes authoritative state once', async () => {
    fixture.client.subscribe({ topic: 'messaging' }, vi.fn());
    const remove = fixture.client.subscribe({ topic: 'resource', resourceId: 2 }, vi.fn());
    await flush();
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    fixture.streams[0].end();
    await flush();
    remove();
    await vi.advanceTimersByTimeAsync(501);
    await flush();
    expect(fixture.streams).toHaveLength(2);
    fixture.streams[1].send({ type: 'ready' });
    await flush();
    expect(fixture.controls.at(-1)?.subscriptions).toEqual([{ topic: 'messaging' }]);
    expect(fixture.recovered).toHaveBeenCalledTimes(1);
  });

  it('stops callbacks and pending retries after disposal and rejects expired control authentication', async () => {
    const callback = vi.fn();
    fixture.client.subscribe({ topic: 'messaging' }, callback);
    await flush();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    fixture.streams[0].send({ type: 'ready' });
    await flush();
    expect(fixture.expired).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fixture.streams).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('retries a failing server with capped jittered backoff and cancels during downtime', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remove = fixture.client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    for (const delay of [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = vi.mocked(fetch).mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledTimes(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(count + 1);
    }
    remove();
    const count = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(count);
  });
});
