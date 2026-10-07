import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import type { LivePacket, LiveSubscription } from '@attraccess/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveUpdatesProvider, resumeLiveUpdates, stopLiveUpdates, useLiveUpdates } from './live-updates';
import { StrictMode } from 'react';

let queryClient: QueryClient;

afterEach(() => {
  cleanup();
  stopLiveUpdates();
  queryClient?.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stream(signal: AbortSignal) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let ended = false;
  const body = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
  });
  const end = () => {
    if (ended) return;
    ended = true;
    controller.close();
  };
  signal.addEventListener('abort', end, { once: true });
  return {
    signal,
    end,
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (packet: LivePacket) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(packet)}\n\n`)),
  };
}

async function flush() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

it.each(['core', 'plugin'] as const)(
  'isolates async %s hook callback failures through the shared client',
  async (kind) => {
    vi.useFakeTimers();
    const streams: ReturnType<typeof stream>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'PUT') return new Response(null, { status: 204 });
        if (!init.signal) throw new Error('Missing signal');
        const next = stream(init.signal);
        streams.push(next);
        return next.response;
      }),
    );
    resumeLiveUpdates();
    queryClient = new QueryClient();
    const updateError = new Error(`${kind} update failed`);
    const reconnectError = new Error(`${kind} reconnect failed`);
    const failingUpdate = vi.fn(async () => {
      throw updateError;
    });
    const failingReconnect = vi.fn(async () => {
      throw reconnectError;
    });
    const healthyUpdate = vi.fn();
    const healthyReconnect = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hook = renderHook(
      () => {
        useLiveUpdates({
          topic: 'billing',
          enabled: kind === 'core',
          onUpdate: failingUpdate,
          onReconnect: failingReconnect,
        });
        useLiveUpdates({
          topic: 'billing',
          enabled: kind === 'core',
          onUpdate: healthyUpdate,
          onReconnect: healthyReconnect,
        });
        usePluginLiveUpdates({
          plugin: 'wago',
          topic: 'diagnostics',
          identifier: '1',
          enabled: kind === 'plugin',
          onUpdate: failingUpdate,
          onReconnect: failingReconnect,
        });
        usePluginLiveUpdates({
          plugin: 'wago',
          topic: 'diagnostics',
          identifier: '1',
          enabled: kind === 'plugin',
          onUpdate: healthyUpdate,
          onReconnect: healthyReconnect,
        });
      },
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
          </QueryClientProvider>
        ),
      },
    );
    const event: LivePacket = {
      type: 'event',
      event:
        kind === 'core'
          ? { topic: 'billing', eventType: 'update', payload: { id: 7 } }
          : { topic: 'plugin:wago:diagnostics', identifier: '1', eventType: 'snapshot', payload: { value: 8 } },
    };
    await act(flush);
    expect(streams).toHaveLength(1);
    await act(async () => {
      streams[0].send({ type: 'ready' });
      streams[0].send(event);
      await flush();
      // Reconnect through the real transport and exercise the hook's restore wrapper.
      streams[0].end();
      await flush();
      await vi.advanceTimersByTimeAsync(501);
      await flush();
    });
    expect(streams).toHaveLength(2);
    await act(async () => {
      streams[1].send({ type: 'ready' });
      streams[1].send(event);
      await flush();
    });
    expect(failingUpdate).toHaveBeenCalledTimes(2);
    expect(healthyUpdate).toHaveBeenCalledTimes(2);
    expect(healthyUpdate).toHaveBeenLastCalledWith(event.event.payload);
    expect(failingReconnect).toHaveBeenCalledTimes(1);
    expect(healthyReconnect).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls).toEqual([
      ['[Live updates] Consumer failed:', updateError],
      ['[Live updates] Consumer failed:', reconnectError],
      ['[Live updates] Consumer failed:', updateError],
    ]);
    hook.unmount();
    await act(flush);
    expect(streams[1].signal.aborted).toBe(true);
  },
);

it('uses one real stream during StrictMode setup and navigation, then synchronously cancels authentication replacement', async () => {
  const streams: ReturnType<typeof stream>[] = [];
  const controls: LiveSubscription[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        controls.push(JSON.parse(init.body as string).subscriptions);
        return new Response(null, { status: 204 });
      }
      if (!init.signal) throw new Error('Missing signal');
      const next = stream(init.signal);
      streams.push(next);
      return next.response;
    }),
  );
  resumeLiveUpdates();
  queryClient = new QueryClient();
  const update = vi.fn();
  const hook = renderHook(({ resourceId }) => useLiveUpdates({ topic: 'resource', resourceId, onUpdate: update }), {
    initialProps: { resourceId: 1 },
    wrapper: ({ children }) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
        </QueryClientProvider>
      </StrictMode>
    ),
  });
  await act(flush);
  expect(streams).toHaveLength(1);
  await act(async () => {
    streams[0].send({ type: 'ready' });
    await flush();
  });
  hook.rerender({ resourceId: 2 });
  await act(flush);
  expect(streams).toHaveLength(1);
  expect(controls.at(-1)).toEqual([{ topic: 'resource', resourceId: 2 }]);
  await act(async () => {
    streams[0].send({
      type: 'event',
      event: { topic: 'resource', resourceId: 2, eventType: 'update', payload: { inUse: true } },
    });
    await flush();
  });
  update.mockClear();
  await act(async () => {
    resumeLiveUpdates();
    expect(streams[0].signal.aborted).toBe(true);
    await flush();
  });
  expect(streams).toHaveLength(2);
  expect(update).not.toHaveBeenCalled();
  hook.unmount();
  await act(flush);
  expect(streams[1].signal.aborted).toBe(true);
});
