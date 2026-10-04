import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveUpdateClient } from './live-update-client';
import { LivePacket, LiveSubscription } from '@attraccess/shared';

function stream() {
  const encoder = new TextEncoder();
  let ended = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (packet: LivePacket) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`)),
    end: () => {
      if (!ended) {
        ended = true;
        controller.close();
      }
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

describe('bundled live client', () => {
  let client: LiveUpdateClient;
  let streams: ReturnType<typeof stream>[];
  let controls: { subscriptions: LiveSubscription[]; present: boolean }[];
  let expired: ReturnType<typeof vi.fn<() => void>>;
  let recovered: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    vi.useFakeTimers();
    streams = [];
    controls = [];
    expired = vi.fn();
    recovered = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (init.method === 'PUT') {
          controls.push(JSON.parse(init.body as string));
          return new Response(null, { status: 204 });
        }
        const next = stream();
        streams.push(next);
        init.signal?.addEventListener('abort', () => next.end(), { once: true });
        return next.response;
      }),
    );
    client = new LiveUpdateClient('http://test', expired, recovered);
  });
  afterEach(() => {
    client.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses one stream for all six types and ten resources; references duplicates and keeps unrelated topics alive', async () => {
    const first = vi.fn(),
      second = vi.fn();
    const remove = client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    const removeSecond = client.subscribe({ topic: 'resource', resourceId: 1 }, second);
    for (let resourceId = 2; resourceId <= 10; resourceId++)
      client.subscribe({ topic: 'resource', resourceId }, vi.fn());
    client.subscribe({ topic: 'flow-logs', resourceId: 1 }, vi.fn());
    for (const topic of ['billing', 'messaging', 'notifications', 'supervision'] as const)
      client.subscribe({ topic }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    expect(streams).toHaveLength(1);
    expect(controls.at(-1)?.subscriptions).toHaveLength(15);
    const event: LivePacket = {
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    };
    streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    remove();
    remove();
    streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    removeSecond();
    await flush();
    expect(controls.at(-1)?.subscriptions).not.toContainEqual({ topic: 'resource', resourceId: 1 });
    expect(streams).toHaveLength(1);
  });

  it('opens a valid connection when plain HTTP provides getRandomValues but no randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(() => client.subscribe({ topic: 'billing' }, vi.fn())).not.toThrow();
    await flush();
    expect(streams).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /\/live-updates\/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\/events$/,
    );
  });

  it('reports visibility changes through the existing transport and removes the listener on final cleanup', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const remove = client.subscribe({ topic: 'notifications' }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    expect(controls.at(-1)?.present).toBe(true);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(controls.at(-1)?.present).toBe(false);
    expect(streams).toHaveLength(1);
    expect(controls).toHaveLength(2);
    remove();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(controls).toHaveLength(2);
  });

  it('isolates callbacks, routes by topic and resource, ignores controls and cancels final consumers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const callback = vi.fn(),
      wrongResource = vi.fn();
    const fail = client.subscribe({ topic: 'messaging' }, () => {
      throw new Error('failure');
    });
    const asyncFail = client.subscribe({ topic: 'messaging' }, async () => {
      throw new Error('async failure');
    });
    const remove = client.subscribe({ topic: 'messaging' }, callback);
    const wrong = client.subscribe({ topic: 'resource', resourceId: 1 }, wrongResource);
    await flush();
    streams[0].send({ type: 'ready' });
    streams[0].send({ type: 'heartbeat' });
    streams[0].send({ type: 'event', event: { topic: 'messaging', eventType: 'update', payload: { id: 5 } } });
    await flush();
    expect(callback).toHaveBeenCalledExactlyOnceWith({ id: 5 });
    expect(wrongResource).not.toHaveBeenCalled();
    fail();
    asyncFail();
    remove();
    wrong();
    await flush();
    // Subsequent stale cleanup cannot close a replacement transport.
    const replacement = client.subscribe({ topic: 'billing' }, vi.fn());
    fail();
    asyncFail();
    remove();
    wrong();
    await flush();
    expect(streams).toHaveLength(2);
    replacement();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streams).toHaveLength(2);
  });

  it('restores only active topics after interruption and refreshes authoritative state once', async () => {
    client.subscribe({ topic: 'messaging' }, vi.fn());
    const remove = client.subscribe({ topic: 'resource', resourceId: 2 }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    streams[0].end();
    await flush();
    remove();
    await vi.advanceTimersByTimeAsync(501);
    await flush();
    expect(streams).toHaveLength(2);
    streams[1].send({ type: 'ready' });
    await flush();
    expect(controls.at(-1)?.subscriptions).toEqual([{ topic: 'messaging' }]);
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('stops callbacks and pending retries after disposal and rejects expired control authentication', async () => {
    const callback = vi.fn();
    client.subscribe({ topic: 'messaging' }, callback);
    await flush();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    streams[0].send({ type: 'ready' });
    await flush();
    expect(expired).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(streams).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('retries a failing server with capped jittered backoff and cancels during downtime', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remove = client.subscribe({ topic: 'billing' }, vi.fn());
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
