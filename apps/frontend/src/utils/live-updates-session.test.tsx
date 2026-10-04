import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import type { LivePacket, LiveSubscription } from '@attraccess/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveUpdatesProvider, resumeLiveUpdates, stopLiveUpdates, useLiveUpdates } from './live-updates';

let queryClient: QueryClient;

afterEach(() => {
  cleanup();
  stopLiveUpdates();
  queryClient?.clear();
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
