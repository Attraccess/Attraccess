import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWagoLiveQuery } from './live-updates';
import { useFrontPanel } from './front-panel/useFrontPanel';

const panelApi = vi.hoisted(() => ({ getDraft: vi.fn(), baseline: vi.fn(), manual: vi.fn() }));
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getDraft: panelApi.getDraft,
  getConfigurationBaseline: panelApi.baseline,
  manualCommand: panelApi.manual,
}));

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

function setupFrontPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const baseline = {
    revision: 7,
    state: 'applied',
    snapshot: JSON.stringify({
      version: 1,
      physicalPoints: [{ id: 'relay', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'output',
          physicalPointId: 'relay',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'hold' },
        },
      ],
    }),
    presetProvenance: null,
  };
  const diagnostics = {
    connectivity: 'online',
    capabilities: ['front-panel-v1'],
    incompatible: false,
    channels: [{ id: 'output', samples: [{ kind: 'output', value: false, current: true }] }],
    configuration: { appliedRevision: 7, revisionMismatch: false, rejected: false },
  };
  const diagnosticsKey = ['wago', 'diagnostics', 1];
  const baselineKey = ['wago', 'configuration-baseline', 1];
  queryClient.setQueryData(diagnosticsKey, diagnostics);
  panelApi.getDraft.mockReset().mockResolvedValue(null);
  panelApi.baseline.mockReset().mockResolvedValue(baseline);
  panelApi.manual.mockReset();
  const consumers = new Map<string, (payload: unknown) => void>();
  const liveClient: PluginLiveUpdatesClient = {
    subscribe: ({ topic }, update) => {
      consumers.set(topic, update);
      return () => consumers.delete(topic);
    },
  };
  const hook = renderHook(() => useFrontPanel(1), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <PluginLiveUpdatesProvider client={liveClient}>{children}</PluginLiveUpdatesProvider>
      </QueryClientProvider>
    ),
  });
  const send = async (topic: string, payload: unknown) => {
    const update = consumers.get(`plugin:wago:${topic}`);
    if (!update) throw new Error(`No subscriber for ${topic}`);
    await act(async () => update(payload));
  };
  return { hook, queryClient, baseline, diagnostics, baselineKey, diagnosticsKey, send };
}

describe('WAGO shared live queries', () => {
  it('disables panel commands when streamed diagnostics become unavailable and restores them on snapshot', async () => {
    const { hook, queryClient, diagnostics, diagnosticsKey, baselineKey, send } = setupFrontPanel();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.live.enabled).toBe(true);
    const channel = hook.result.current.applied?.snapshot.logicalChannels[0];
    if (!channel) throw new Error('Missing applied output fixture');
    const updatedAt = queryClient.getQueryState(diagnosticsKey)?.dataUpdatedAt;

    await send('diagnostics', { eventType: 'unavailable' });
    await waitFor(() => expect(hook.result.current.live.enabled).toBe(false));
    expect(hook.result.current.diagnostics.isError).toBe(true);
    expect(hook.result.current.live.diagnostics).toEqual(diagnostics);
    expect(queryClient.getQueryData(diagnosticsKey)).toEqual(diagnostics);
    expect(queryClient.getQueryState(diagnosticsKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(baselineKey)?.status).toBe('success');
    expect(hook.result.current.ready).toBe(true);
    act(() => hook.result.current.live.command(channel, true));
    expect(panelApi.manual).not.toHaveBeenCalled();

    await send('diagnostics', { eventType: 'snapshot', value: diagnostics });
    await waitFor(() => expect(hook.result.current.live.enabled).toBe(true));
    expect(hook.result.current.diagnostics.error).toBeNull();
    expect(panelApi.baseline).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });

  it('makes the panel unready on unavailable baseline while retaining its revision, then recovers on snapshot', async () => {
    const { hook, queryClient, baseline, diagnosticsKey, baselineKey, send } = setupFrontPanel();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const applied = hook.result.current.applied;
    const updatedAt = queryClient.getQueryState(baselineKey)?.dataUpdatedAt;

    await send('configuration-baseline', { eventType: 'unavailable' });
    await waitFor(() => expect(hook.result.current.ready).toBe(false));
    expect(hook.result.current.loadError).toBe(true);
    expect(hook.result.current.applied).toEqual(applied);
    expect(queryClient.getQueryData(baselineKey)).toEqual(baseline);
    expect(queryClient.getQueryState(baselineKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(diagnosticsKey)?.status).toBe('success');

    await send('configuration-baseline', { eventType: 'snapshot', value: baseline });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.loadError).toBe(false);
    expect(hook.result.current.live.enabled).toBe(true);
    expect(queryClient.getQueryState(baselineKey)?.error).toBeNull();
    expect(panelApi.baseline).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });

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
