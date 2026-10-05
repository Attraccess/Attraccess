import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
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
  const body = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
    },
  });
  signal.addEventListener('abort', () => controller.close(), { once: true });
  return {
    signal,
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (packet: LivePacket) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(packet)}\n\n`)),
  };
}

async function flush() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

it('replaces an active client on same-user login and ignores the former session’s late 403', async () => {
  const streams: ReturnType<typeof stream>[] = [];
  const controls: Array<{ url: string; subscriptions: LiveSubscription[]; resolve: (response: Response) => void }> = [];
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      requests.push(url);
      if (init.method === 'PUT') {
        // Deliberately allow a late response even after the request signal is aborted.
        const { subscriptions } = JSON.parse(init.body as string);
        return new Promise<Response>((resolve) => controls.push({ url, subscriptions, resolve }));
      }
      if (!init.signal) throw new Error('Missing transport abort signal');
      const next = stream(init.signal);
      streams.push(next);
      return Promise.resolve(next.response);
    }),
  );
  resumeLiveUpdates();
  queryClient = new QueryClient();
  const onUpdate = vi.fn();
  const onPluginUpdate = vi.fn();
  const hook = renderHook(
    () => {
      usePluginLiveUpdates({ plugin: 'wago', topic: 'diagnostics', identifier: '1', onUpdate: onPluginUpdate });
      return useLiveUpdates({ topic: 'billing', onUpdate });
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
        </QueryClientProvider>
      ),
    },
  );
  await act(flush);
  expect(streams).toHaveLength(1);
  await act(async () => {
    streams[0].send({ type: 'ready' });
    await flush();
  });
  expect(controls).toHaveLength(1);
  const formerRequest = controls[0];
  const firstTransportUrl = requests[0];
  const newSessionUser = { id: 1, session: 'B' };
  queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), newSessionUser);
  const clear = vi.spyOn(queryClient, 'clear');
  await act(async () => {
    resumeLiveUpdates();
    // Disposal happens before React has rendered the replacement provider.
    expect(streams[0].signal.aborted).toBe(true);
    await flush();
  });
  expect(streams).toHaveLength(2);
  expect(requests[2]).not.toBe(firstTransportUrl);
  await act(async () => {
    streams[1].send({ type: 'ready' });
    await flush();
    expect(controls).toHaveLength(2);
    expect(controls[1].subscriptions).toEqual(
      expect.arrayContaining([{ topic: 'billing' }, { topic: 'plugin:wago:diagnostics', identifier: '1' }]),
    );
    expect(controls[1].url).not.toBe(formerRequest.url);
    controls[1].resolve(new Response(null, { status: 204 }));
    formerRequest.resolve(new Response(null, { status: 403 }));
    await flush();
    streams[1].send({ type: 'event', event: { topic: 'billing', eventType: 'update', payload: { session: 'B' } } });
    streams[1].send({
      type: 'event',
      event: {
        topic: 'plugin:wago:diagnostics',
        identifier: '1',
        eventType: 'snapshot',
        payload: { eventType: 'snapshot', value: { session: 'B' } },
      },
    });
    await flush();
  });
  expect(clear).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(UseUsersServiceGetCurrentKeyFn())).toEqual(newSessionUser);
  expect(streams[1].signal.aborted).toBe(false);
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ session: 'B' });
  expect(onPluginUpdate).toHaveBeenCalledExactlyOnceWith({ eventType: 'snapshot', value: { session: 'B' } });
  hook.unmount();
});

it('recovers cookie rotation without explicit login, retaining queries and only active core/plugin consumers', async () => {
  vi.useFakeTimers();
  const streams: Array<ReturnType<typeof stream> & { url: string }> = [];
  const controls: LiveSubscription[][] = [];
  let rotated = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        if (rotated && url.includes(streams[0].url.replace('/events', ''))) {
          return new Response(JSON.stringify({ code: 'LIVE_UPDATES_SESSION_CHANGED' }), { status: 403 });
        }
        controls.push(JSON.parse(init.body as string).subscriptions);
        return new Response(null, { status: 204 });
      }
      if (!init.signal) throw new Error('Missing signal');
      const next = { ...stream(init.signal), url };
      streams.push(next);
      return next.response;
    }),
  );
  resumeLiveUpdates();
  queryClient = new QueryClient();
  const authenticatedUser = { id: 1 };
  queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), authenticatedUser);
  const clear = vi.spyOn(queryClient, 'clear');
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onUpdate = vi.fn();
  const onPluginUpdate = vi.fn();
  const hook = renderHook(
    ({ enabled }) => {
      usePluginLiveUpdates({ plugin: 'wago', topic: 'diagnostics', identifier: '1', onUpdate: onPluginUpdate });
      useLiveUpdates({ topic: 'resource', resourceId: 2, enabled, onUpdate: vi.fn() });
      return useLiveUpdates({ topic: 'billing', onUpdate });
    },
    {
      initialProps: { enabled: true },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
        </QueryClientProvider>
      ),
    },
  );
  await act(flush);
  await act(async () => {
    streams[0].send({ type: 'ready' });
    await flush();
  });
  rotated = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
  });
  expect(streams[0].signal.aborted).toBe(true);
  hook.rerender({ enabled: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(501);
    await flush();
  });
  expect(streams).toHaveLength(2);
  expect(streams[1].url).not.toBe(streams[0].url);
  await act(async () => {
    streams[1].send({ type: 'ready' });
    streams[1].send({ type: 'event', event: { topic: 'billing', eventType: 'update', payload: { id: 7 } } });
    streams[1].send({
      type: 'event',
      event: { topic: 'plugin:wago:diagnostics', identifier: '1', eventType: 'snapshot', payload: { value: 8 } },
    });
    await flush();
  });
  expect(controls.at(-1)).toEqual(
    expect.arrayContaining([{ topic: 'billing' }, { topic: 'plugin:wago:diagnostics', identifier: '1' }]),
  );
  expect(controls.at(-1)).toHaveLength(2);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(clear).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(UseUsersServiceGetCurrentKeyFn())).toEqual(authenticatedUser);
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ id: 7 });
  expect(onPluginUpdate).toHaveBeenCalledExactlyOnceWith({ value: 8 });
  act(() => stopLiveUpdates());
  expect(streams[1].signal.aborted).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
  });
  expect(streams).toHaveLength(2);
  hook.unmount();
});

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
