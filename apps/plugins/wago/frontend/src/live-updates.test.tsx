import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWagoLiveQuery } from './live-updates';

afterEach(cleanup);

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const queryKey = ['wago', 'diagnostics', 1];
  const consumers = new Set<{ update: (payload: unknown) => void; reconnect?: () => void }>();
  const liveClient: PluginLiveUpdatesClient = {
    subscribe: (_subscription, update, reconnect) => {
      const consumer = { update, reconnect };
      consumers.add(consumer);
      return () => consumers.delete(consumer);
    },
  };
  const read = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
    // Reading the signal enables Query's cancellation path for overlapping refreshes.
    signal.throwIfAborted();
    return { source: 'rest' };
  });
  const hook = renderHook(
    () => {
      useWagoLiveQuery(queryKey, 'diagnostics', '1');
      useWagoLiveQuery(queryKey, 'diagnostics', '1');
      return useQuery({ queryKey, queryFn: read });
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <PluginLiveUpdatesProvider client={liveClient}>{children}</PluginLiveUpdatesProvider>
        </QueryClientProvider>
      ),
    },
  );
  return { hook, queryClient, queryKey, consumers, read };
}

describe('WAGO shared live queries', () => {
  it('lets the host refresh once on reconnect even with duplicate local consumers', async () => {
    const { hook, queryClient, consumers, read } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      // The host refresh runs before subscription-specific recovery callbacks.
      const refresh = queryClient.invalidateQueries();
      consumers.forEach((consumer) => consumer.reconnect?.());
      await refresh;
    });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
    expect(read).toHaveBeenCalledTimes(2);
    hook.unmount();
    queryClient.clear();
  });

  it('marks retained snapshots unavailable without REST reads, then restores success on recovery', async () => {
    const { hook, queryClient, queryKey, consumers, read } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { source: 'live' } }));
    });
    const snapshotUpdatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
    const otherKey = ['wago', 'diagnostics', 2];
    queryClient.setQueryData(otherKey, { source: 'other-controller' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'unavailable' }));
      });
      await waitFor(() => expect(hook.result.current.isError).toBe(true));
      expect(queryClient.getQueryData(queryKey)).toEqual({ source: 'live' });
      expect(hook.result.current.data).toEqual({ source: 'live' });
      expect(hook.result.current.error).toEqual(new Error('Live updates are temporarily unavailable.'));
      expect(queryClient.getQueryState(queryKey)?.errorUpdatedAt).toBeGreaterThan(0);
      expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(snapshotUpdatedAt);
      expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
      expect(read).toHaveBeenCalledTimes(1);
    }
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { source: 'recovered' } }));
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual({ source: 'recovered' });
    expect(hook.result.current.error).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });
});
