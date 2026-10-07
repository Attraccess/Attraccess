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

function setup(queryFn?: () => Promise<unknown>) {
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
  it.each(['snapshot', 'unavailable'] as const)(
    'keeps a streamed %s authoritative when the initial REST read settles later',
    async (eventType) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const read = vi.fn(() => pending);
      const { hook, queryClient, queryKey, consumers } = setup(read);
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 8 } }));
      });
      await act(async () => resolve({ revision: 7 }));
      await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
      expect(queryClient.getQueryState(queryKey)?.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      expect(queryClient.getQueryData(queryKey)).toEqual(eventType === 'snapshot' ? { revision: 8 } : undefined);
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } }));
      });
      expect(queryClient.getQueryData(queryKey)).toEqual({ revision: 9 });
      await waitFor(() => expect(hook.result.current.data).toEqual({ revision: 9 }));
      expect(hook.result.current.isSuccess).toBe(true);
      hook.unmount();
      queryClient.clear();
    },
  );

  it('retains live revisions and unavailable state across a pending reconnect refresh', async () => {
    const { hook, queryClient, queryKey, consumers } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const otherKey = ['wago', 'diagnostics', 2];
    queryClient.setQueryData(otherKey, { revision: 3 });
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
    });
    const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const read = vi.fn(() => pending);
    let refresh!: Promise<void>;
    await act(async () => {
      queryClient.getQueryCache().find({ queryKey, exact: true })?.setOptions({ queryKey, queryFn: read });
      refresh = queryClient.invalidateQueries({ queryKey, exact: true });
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'unavailable' }));
      resolve({ revision: 7 });
      await refresh;
    });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.data).toEqual({ revision: 8 });
    expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } }));
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data).toEqual({ revision: 9 });
    hook.unmount();
    queryClient.clear();
  });

  it.each(['diagnostics', 'configuration-baseline'])(
    'keeps panel %s unavailable after an older reconnect read resolves',
    async (topic) => {
      const { hook, queryClient, baseline, diagnostics, baselineKey, diagnosticsKey, send } = setupFrontPanel();
      await waitFor(() => expect(hook.result.current.ready).toBe(true));
      const queryKey = topic === 'diagnostics' ? diagnosticsKey : baselineKey;
      const value = topic === 'diagnostics' ? diagnostics : baseline;
      const otherKey = topic === 'diagnostics' ? baselineKey : diagnosticsKey;
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!query) throw new Error('Missing panel query');
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      let refresh!: Promise<unknown>;
      await act(async () => {
        refresh = query.fetch({ ...query.options, queryFn: () => pending });
      });
      await send(topic, { eventType: 'unavailable' });
      await act(async () => {
        resolve(
          topic === 'diagnostics'
            ? { ...diagnostics, configuration: { appliedRevision: 6 } }
            : { ...baseline, revision: 6 },
        );
        await refresh;
      });
      await waitFor(() => expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle'));
      expect(queryClient.getQueryState(queryKey)?.status).toBe('error');
      expect(queryClient.getQueryData(queryKey)).toEqual(value);
      expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
      if (topic === 'diagnostics') {
        expect(hook.result.current.live.enabled).toBe(false);
        const channel = hook.result.current.applied?.snapshot.logicalChannels[0];
        if (!channel) throw new Error('Missing output fixture');
        act(() => hook.result.current.live.command(channel, true));
        expect(panelApi.manual).not.toHaveBeenCalled();
      } else {
        expect(hook.result.current.ready).toBe(false);
        expect(hook.result.current.applied?.snapshot.logicalChannels[0].id).toBe('output');
      }
      await send(topic, { eventType: 'snapshot', value });
      await waitFor(() => expect(hook.result.current.ready && hook.result.current.live.enabled).toBe(true));
      hook.unmount();
      queryClient.clear();
    },
  );

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

describe('WAGO REST settlement ordering', () => {
  it.each(['snapshot', 'unavailable'] as const)(
    'preserves %s between retryer settlement and cache commit',
    async (eventType) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const { hook, queryClient, queryKey, consumers } = setup(() => pending);
      await waitFor(() => expect(consumers.size).toBe(2));
      await act(async () => {
        resolve({ revision: 7 });
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 8 } }));
      });
      await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
      const state = queryClient.getQueryState(queryKey);
      hook.unmount();
      queryClient.clear();
      expect(state?.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      expect(state?.data).toEqual(eventType === 'snapshot' ? { revision: 8 } : undefined);
    },
  );

  it.each(['snapshot', 'unavailable'] as const)(
    'retains the latest snapshot during a settled reconnect read followed by %s',
    async (eventType) => {
      const { hook, queryClient, queryKey, consumers } = setup();
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
      });
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!query) throw new Error('Missing live query');
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      let refresh!: Promise<unknown>;
      await act(async () => {
        refresh = query.fetch({ ...query.options, queryFn: () => pending });
      });
      await act(async () => {
        resolve({ revision: 7 });
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 9 } }));
        await refresh;
      });
      expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
      expect(queryClient.getQueryData(queryKey)).toEqual({ revision: eventType === 'snapshot' ? 9 : 8 });
      await waitFor(() => expect(hook.result.current.data).toEqual({ revision: eventType === 'snapshot' ? 9 : 8 }));
      expect(hook.result.current.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      if (eventType === 'unavailable') expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(updatedAt);
      hook.unmount();
      queryClient.clear();
    },
  );

  it.each([
    ['snapshot', 'snapshot'],
    ['snapshot', 'unavailable'],
    ['unavailable', 'snapshot'],
  ] as const)('keeps the later %s/%s event across duplicate consumers', async (first, last) => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { hook, queryClient, queryKey, consumers } = setup(() => pending);
    await waitFor(() => expect(consumers.size).toBe(2));
    await act(async () => {
      resolve({ revision: 7 });
      await Promise.resolve();
      consumers.forEach((consumer) => consumer.update({ eventType: first, value: { revision: 8 } }));
      consumers.forEach((consumer) => consumer.update({ eventType: last, value: { revision: 9 } }));
    });
    expect(queryClient.getQueryState(queryKey)?.status).toBe(last === 'snapshot' ? 'success' : 'error');
    expect(queryClient.getQueryData(queryKey)).toEqual({ revision: last === 'snapshot' ? 9 : 8 });
    expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
    hook.unmount();
    queryClient.clear();
  });

  it('does not restore old live state into a replacement cache query', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { hook, queryClient, queryKey, consumers } = setup(() => pending);
    await waitFor(() => expect(consumers.size).toBe(2));
    await act(async () => {
      resolve({ revision: 7 });
      await Promise.resolve();
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
      hook.unmount();
      queryClient.clear();
      queryClient.setQueryData(queryKey, { revision: 10 });
    });
    expect(queryClient.getQueryData(queryKey)).toEqual({ revision: 10 });
    queryClient.clear();
  });
});
