import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { useWagoLiveQuery } from './live-updates';
import { useFrontPanel } from '../front-panel/working-copy/useFrontPanel';

const panelApi = vi.hoisted(() => ({ getDraft: vi.fn(), baseline: vi.fn(), manual: vi.fn() }));
export { panelApi };
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  getDraft: panelApi.getDraft,
  getConfigurationBaseline: panelApi.baseline,
  manualCommand: panelApi.manual,
}));

export function setup(queryFn?: () => Promise<unknown>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const queryKey = ['wago', 'diagnostics', 1];
  const consumers = new Set<{ update: (payload: unknown) => void; reconnect?: () => void; unavailable?: () => void }>();
  const liveClient: PluginLiveUpdatesClient = {
    subscribe: (_subscription, update, reconnect, unavailable) => {
      const consumer = { update, reconnect, unavailable };
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
      return useQuery({ queryKey, queryFn: queryFn ?? read, notifyOnChangeProps: 'all' });
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

export function setupFrontPanel() {
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
  const failures = new Map<string, () => void>();
  const liveClient: PluginLiveUpdatesClient = {
    subscribe: ({ topic }, update, _reconnect, unavailable) => {
      consumers.set(topic, update);
      if (unavailable) failures.set(topic, unavailable);
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
  return { hook, queryClient, baseline, diagnostics, baselineKey, diagnosticsKey, send, failures };
}
