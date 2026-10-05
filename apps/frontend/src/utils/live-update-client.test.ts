import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveUpdateClient } from './live-update-client';
import { LivePacket, LiveSubscription } from '@attraccess/shared';

function stream(signal?: AbortSignal, url?: string) {
  const encoder = new TextEncoder();
  let ended = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    signal,
    url,
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
        const next = stream(init.signal ?? undefined, url);
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

  it('shares plugin topics with core, reference-counts duplicates and routes namespaces/identifiers independently', async () => {
    const first = vi.fn(),
      second = vi.fn(),
      otherDevice = vi.fn(),
      otherPlugin = vi.fn();
    const subscription = { topic: 'plugin:wago:diagnostics', identifier: '1' } as const;
    const remove = client.subscribe(subscription, first);
    const removeSecond = client.subscribe(subscription, second);
    client.subscribe({ ...subscription, identifier: '2' }, otherDevice);
    client.subscribe({ topic: 'plugin:shelly:diagnostics', identifier: '1' }, otherPlugin);
    client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    expect(streams).toHaveLength(1);
    expect(controls.at(-1)?.subscriptions).toHaveLength(4);
    const event: LivePacket = {
      type: 'event',
      event: { ...subscription, eventType: 'snapshot', payload: { value: 7 } },
    };
    streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(otherDevice).not.toHaveBeenCalled();
    expect(otherPlugin).not.toHaveBeenCalled();
    remove();
    remove();
    streams[0].send(event);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    removeSecond();
    await flush();
    expect(controls.at(-1)?.subscriptions).not.toContainEqual(subscription);
    expect(streams).toHaveLength(1);
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

  it.each(['same', 'different'])('retains the connection across a %s-topic replacement in one batch', async (kind) => {
    const departed = vi.fn();
    const remove = client.subscribe({ topic: 'resource', resourceId: 1 }, departed);
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'started', payload: { inUse: true } },
    });
    await flush();
    const replacement = vi.fn();
    remove();
    const subscription: LiveSubscription =
      kind === 'same' ? { topic: 'resource' as const, resourceId: 1 } : { topic: 'billing' as const };
    const removeReplacement = client.subscribe(subscription, replacement);
    remove();
    await flush();
    expect(streams).toHaveLength(1);
    expect(streams[0].signal?.aborted).toBe(false);
    expect(controls.at(-1)?.subscriptions).toEqual([subscription]);
    expect(departed).toHaveBeenCalledTimes(1);
    if (kind === 'same') expect(replacement).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: true });
    removeReplacement();
    await flush();
    expect(streams[0].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replays resource state only to a late consumer without replaying usage actions or erasing it on health events', async () => {
    const first = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    await flush();
    streams[0].send({ type: 'ready' });
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false, timestamp: 'initial' } },
    });
    await flush();
    const second = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, second);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: false, timestamp: 'initial' });
    streams[0].send({
      type: 'event',
      event: {
        topic: 'resource',
        resourceId: 1,
        eventType: 'started',
        payload: { inUse: true, resourceId: 99, eventType: 'started', usage: { id: 5 } },
      },
    });
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'health', payload: { status: 'unavailable' } },
    });
    await flush();
    const late = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, late);
    await flush();
    expect(late).toHaveBeenCalledExactlyOnceWith({ resourceId: 1, inUse: true });
    expect(first).toHaveBeenCalledTimes(3);
    expect(controls).toHaveLength(1);
  });

  it('replays in-use state to a consumer that joins during a health-only callback', async () => {
    const late = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, (payload) => {
      if (payload && typeof payload === 'object' && 'status' in payload) {
        client.subscribe({ topic: 'resource', resourceId: 1 }, late);
      }
    });
    await flush();
    streams[0].send({ type: 'ready' });
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'health', payload: { status: 'unavailable' } },
    });
    await flush();
    expect(late.mock.calls).toEqual([[{ status: 'unavailable' }], [{ resourceId: 1, inUse: true }]]);
    expect(streams).toHaveLength(1);
    expect(controls).toHaveLength(1);
  });

  it('shares pending initial state and cancels replay on removal, resource change or a newer live packet', async () => {
    const first = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, first);
    const waiting = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, waiting);
    await flush();
    streams[0].send({ type: 'ready' });
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false } },
    });
    await flush();
    expect(waiting).toHaveBeenCalledExactlyOnceWith({ inUse: false });
    const removed = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, removed)();
    const otherResource = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 2 }, otherResource);
    await flush();
    expect(removed).not.toHaveBeenCalled();
    expect(otherResource).not.toHaveBeenCalled();

    // Register during live delivery: its queued replay must lose to that live packet.
    const joined = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, () => {
      client.subscribe({ topic: 'resource', resourceId: 1 }, joined);
    });
    await flush();
    joined.mockClear();
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'ended', payload: { inUse: true } },
    });
    await flush();
    expect(joined).toHaveBeenCalledTimes(2); // Two registered consumers, each gets only the live event.
    expect(joined.mock.calls.every(([value]) => value.inUse === true)).toBe(true);
  });

  it('clears snapshots on rejection, retries a rejected shared topic on join and clears them on disconnect', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    client.subscribe({ topic: 'resource', resourceId: 1 }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    streams[0].send({ type: 'rejected', subscription: { topic: 'resource', resourceId: 1 }, reason: 'Forbidden' });
    await flush();
    const late = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, late);
    await flush();
    expect(late).not.toHaveBeenCalled();
    expect(controls).toHaveLength(2);
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: false } },
    });
    await flush();
    streams[0].end();
    await flush();
    const afterDisconnect = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, afterDisconnect);
    await flush();
    expect(afterDisconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    streams[1].send({ type: 'ready' });
    streams[1].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 1, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
    expect(afterDisconnect).toHaveBeenCalledExactlyOnceWith({ inUse: true });
  });

  it('ignores malformed rejection subscriptions without interrupting valid delivery', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const update = vi.fn();
    client.subscribe({ topic: 'billing' }, update);
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    for (const subscription of [null, 'billing', {}, { topic: 1 }]) {
      streams[0].send({ type: 'rejected', subscription, reason: 'Invalid topic' });
      await flush();
    }
    streams[0].send({ type: 'event', event: { topic: 'billing', eventType: 'update', payload: { id: 7 } } });
    await flush();
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7 });
    expect(streams[0].signal?.aborted).toBe(false);
    expect(streams).toHaveLength(1);
  });

  it('recovers only an explicit same-user session change through bounded reconnect without expiring', async () => {
    client.subscribe({ topic: 'billing' }, vi.fn());
    client.subscribe({ topic: 'plugin:wago:diagnostics', identifier: '1' }, vi.fn());
    const remove = client.subscribe({ topic: 'resource', resourceId: 2 }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    await flush();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
    );
    document.dispatchEvent(new Event('visibilitychange')); // No notification consumer: no control.
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(streams[0].signal?.aborted).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    remove();
    await vi.advanceTimersByTimeAsync(501);
    expect(streams).toHaveLength(2);
    expect(streams[1].url).not.toBe(streams[0].url);
    streams[1].send({ type: 'ready' });
    await flush();
    expect(controls.at(-1)?.subscriptions).toEqual([
      { topic: 'billing' },
      { topic: 'plugin:wago:diagnostics', identifier: '1' },
    ]);
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it.each(['not json', '{}', '{"code":"UNKNOWN"}', '{"code":"LIVE_UPDATES_SESSION_CHANGED","unused":1}'])(
    'distinguishes control 403 body %s',
    async (body) => {
      client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 403 }));
      streams[0].send({ type: 'ready' });
      await flush();
      expect(expired).toHaveBeenCalledTimes(body.includes('LIVE_UPDATES_SESSION_CHANGED') ? 0 : 1);
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
      const remove = client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      vi.mocked(fetch).mockResolvedValueOnce(response);
      streams[0].send({ type: 'ready' });
      await flush();
      remove();
      await flush();
      client.subscribe({ topic: 'messaging' }, vi.fn());
      await flush();
      streams[1].send({ type: 'ready' });
      await flush();
      resolve({ code });
      await flush();
      expect(expired).not.toHaveBeenCalled();
      expect(streams[1].signal?.aborted).toBe(false);
    },
  );

  it('caps repeated session recovery attempts and cancels final unsubscribe during recovery backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const remove = client.subscribe({ topic: 'billing' }, vi.fn());
    await flush();
    for (const delay of [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
      );
      streams.at(-1)?.send({ type: 'ready' });
      await flush();
      const count = streams.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(streams).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(streams).toHaveLength(count + 1);
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 }),
    );
    streams.at(-1)?.send({ type: 'ready' });
    await flush();
    remove();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    const count = streams.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streams).toHaveLength(count);
    expect(expired).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'expires stream authentication with status %s even if its body claims recovery',
    async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status }),
      );
      client.subscribe({ topic: 'billing' }, vi.fn());
      await flush();
      expect(expired).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not replay non-resource topics or resource state from a genuinely removed topic', async () => {
    client.subscribe({ topic: 'billing' }, vi.fn());
    const remove = client.subscribe({ topic: 'resource', resourceId: 1 }, vi.fn());
    await flush();
    streams[0].send({ type: 'ready' });
    const subscriptions: LiveSubscription[] = [{ topic: 'resource', resourceId: 1 }, { topic: 'billing' }];
    for (const subscription of subscriptions) {
      streams[0].send({ type: 'event', event: { ...subscription, eventType: 'update', payload: { inUse: true } } });
    }
    await flush();
    const billing = vi.fn();
    client.subscribe({ topic: 'billing' }, billing);
    remove();
    await flush();
    const resource = vi.fn();
    client.subscribe({ topic: 'resource', resourceId: 1 }, resource);
    await flush();
    expect(billing).not.toHaveBeenCalled();
    expect(resource).not.toHaveBeenCalled();
  });
});
