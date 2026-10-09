import { StrictMode, useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveUpdatesProvider, resumeLiveUpdates, stopLiveUpdates, useLiveUpdates } from './live-updates';
import { useLiveLogs } from '../app/resources/details/flows/liveLogs';
import { PluginLiveUpdatesProvider, usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';

const state = vi.hoisted(() => ({
  clients: [] as {
    callbacks: Set<(data: unknown) => void>;
    subscriptions: { onUpdate: (data: unknown) => void; onReconnect: () => void; onUnavailable: () => void }[];
    dispose: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('./live-update-client', () => ({
  LiveUpdateClient: class {
    callbacks = new Set<(data: unknown) => void>();
    subscriptions: { onUpdate: (data: unknown) => void; onReconnect: () => void; onUnavailable: () => void }[] = [];
    dispose = vi.fn(() => this.callbacks.clear());
    constructor() {
      state.clients.push(this);
    }
    subscribe(_topic: unknown, callback: (data: unknown) => void, onReconnect: () => void, onUnavailable: () => void) {
      this.callbacks.add(callback);
      this.subscriptions.push({ onUpdate: callback, onReconnect, onUnavailable });
      return () => this.callbacks.delete(callback);
    }
  },
}));
beforeEach(() => resumeLiveUpdates());
afterEach(() => {
  act(() => stopLiveUpdates());
  state.clients.length = 0;
});

describe('live topic React lifecycle', () => {
  it.each(['resource', 'user', 'login', 'logout'] as const)(
    'flow logs reset immediately on %s changes and ignore obsolete delivery',
    (change) => {
      const queryClient = new QueryClient();
      let userId = 1;
      const onUpdate = vi.fn();
      const committedLogs: number[][] = [];
      const hook = renderHook(
        ({ resourceId }) => {
          const result = useLiveLogs({ resourceId, onUpdate });
          useLayoutEffect(() => {
            committedLogs.push(result.liveLogs.map((log) => log.id));
          });
          return result;
        },
        {
          initialProps: { resourceId: 1 },
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
              <LiveUpdatesProvider userId={userId}>{children}</LiveUpdatesProvider>
            </QueryClientProvider>
          ),
        },
      );
      const old = state.clients[0].subscriptions[0];
      act(() => old.onUpdate({ id: 1, resourceId: 1 }));
      expect(hook.result.current.liveLogs.map((log) => log.id)).toEqual([1]);
      committedLogs.length = 0;
      if (change === 'resource') hook.rerender({ resourceId: 2 });
      if (change === 'user') {
        userId = 2;
        hook.rerender({ resourceId: 1 });
      }
      if (change === 'login') act(() => resumeLiveUpdates());
      if (change === 'logout') act(() => stopLiveUpdates());
      expect(committedLogs.every((logs) => logs.length === 0)).toBe(true);
      expect(hook.result.current.liveLogs).toEqual([]);
      act(() => old.onUpdate({ id: 99, resourceId: 1 }));
      expect(hook.result.current.liveLogs).toEqual([]);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      if (change === 'logout') act(() => resumeLiveUpdates());
      const current = state.clients.at(-1)?.subscriptions.at(-1);
      act(() => current?.onUpdate({ id: 2, resourceId: change === 'resource' ? 2 : 1 }));
      expect(hook.result.current.liveLogs.map((log) => log.id)).toEqual([2]);
      if (change === 'resource') {
        hook.rerender({ resourceId: 1 });
        expect(hook.result.current.liveLogs).toEqual([]);
      }
      hook.result.current.abort();
      act(() => current?.onUpdate({ id: 3 }));
      expect(onUpdate).toHaveBeenCalledTimes(2);
      hook.unmount();
    },
  );

  it.each(['resource', 'topic', 'disable', 'client'] as const)(
    'core callbacks reject obsolete ownership during %s replacement before passive cleanup',
    (replacement) => {
      const queryClient = new QueryClient();
      let userId = 1;
      let obsolete:
        { onUpdate: (data: unknown) => void; onReconnect: () => void; onUnavailable: () => void } | undefined =
        undefined;
      const firstUpdate = vi.fn();
      const firstReconnect = vi.fn();
      const nextUpdate = vi.fn();
      const nextReconnect = vi.fn();
      const unavailable = vi.fn();
      const initialProps = {
        topic: 'resource' as 'resource' | 'flow-logs',
        resourceId: 1,
        enabled: true,
        onUpdate: firstUpdate,
        onReconnect: firstReconnect,
        onUnavailable: unavailable,
      };
      const hook = renderHook(
        (props) => {
          const result = useLiveUpdates(props);
          // Layout effects run after render, before the old subscription's passive cleanup.
          useLayoutEffect(() => {
            obsolete?.onUpdate({ inUse: true });
            obsolete?.onReconnect();
            obsolete?.onUnavailable();
          });
          return result;
        },
        {
          initialProps,
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
              <LiveUpdatesProvider userId={userId}>{children}</LiveUpdatesProvider>
            </QueryClientProvider>
          ),
        },
      );
      obsolete = state.clients[0].subscriptions[0];
      if (replacement === 'client') userId = 2;
      hook.rerender({
        ...initialProps,
        topic: replacement === 'topic' ? 'flow-logs' : 'resource',
        resourceId: replacement === 'resource' ? 2 : 1,
        enabled: replacement !== 'disable',
        onUpdate: nextUpdate,
        onReconnect: nextReconnect,
      });
      expect(firstUpdate).not.toHaveBeenCalled();
      expect(firstReconnect).not.toHaveBeenCalled();
      expect(nextUpdate).not.toHaveBeenCalled();
      expect(nextReconnect).not.toHaveBeenCalled();
      expect(unavailable).not.toHaveBeenCalled();
      if (replacement !== 'disable') {
        const current = state.clients.at(-1)?.subscriptions.at(-1);
        current?.onUpdate({ inUse: false });
        current?.onReconnect();
        current?.onUnavailable();
        expect(nextUpdate).toHaveBeenCalledTimes(1);
        expect(nextReconnect).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledTimes(1);
        hook.result.current.abort();
        hook.result.current.abort();
        current?.onUpdate({ inUse: true });
        current?.onReconnect();
        current?.onUnavailable();
        expect(nextUpdate).toHaveBeenCalledTimes(1);
        expect(nextReconnect).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledTimes(1);
        hook.unmount();
        current?.onUpdate({ inUse: true });
        current?.onReconnect();
        current?.onUnavailable();
        expect(nextUpdate).toHaveBeenCalledTimes(1);
        expect(nextReconnect).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledTimes(1);
      } else hook.unmount();
    },
  );
  it('plugin unavailable callbacks follow ownership, abort and unmount guards', () => {
    const failures: Array<() => void> = [];
    const client = {
      subscribe: vi.fn((_subscription, _update, _restore, unavailable: () => void) => {
        failures.push(unavailable);
        return vi.fn();
      }),
    };
    const onUnavailable = vi.fn();
    const hook = renderHook(
      ({ identifier, enabled }) =>
        usePluginLiveUpdates({
          plugin: 'wago',
          topic: 'diagnostics',
          identifier,
          enabled,
          onUpdate: vi.fn(),
          onUnavailable,
        }),
      {
        initialProps: { identifier: '1', enabled: true },
        wrapper: ({ children }) => <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>,
      },
    );
    hook.rerender({ identifier: '2', enabled: true });
    failures[0]();
    expect(onUnavailable).not.toHaveBeenCalled();
    failures[1]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    hook.rerender({ identifier: '2', enabled: false });
    failures[1]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    hook.rerender({ identifier: '2', enabled: true });
    hook.result.current.abort();
    failures[2]();
    hook.unmount();
    failures[2]();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('late plugin packets cannot update a replacement identifier or an aborted consumer', () => {
    const callbacks: Array<(payload: unknown) => void> = [];
    const client = {
      subscribe: vi.fn((_subscription, callback: (payload: unknown) => void) => {
        callbacks.push(callback);
        return vi.fn();
      }),
    };
    const onUpdate = vi.fn();
    const hook = renderHook(
      ({ identifier }) => usePluginLiveUpdates({ plugin: 'wago', topic: 'diagnostics', identifier, onUpdate }),
      {
        initialProps: { identifier: '1' },
        wrapper: ({ children }) => <PluginLiveUpdatesProvider client={client}>{children}</PluginLiveUpdatesProvider>,
      },
    );
    hook.rerender({ identifier: '2' });
    callbacks[0]({ id: 1 });
    expect(onUpdate).not.toHaveBeenCalled();
    callbacks[1]({ id: 2 });
    expect(onUpdate).toHaveBeenCalledWith({ id: 2 });
    hook.result.current.abort();
    callbacks[1]({ id: 2 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('plugin SDK hooks use the host client and stop on disable, abort, unmount and logout', async () => {
    const queryClient = new QueryClient();
    const onUpdate = vi.fn();
    const hook = renderHook(
      ({ enabled }) => {
        useLiveUpdates({ topic: 'billing', onUpdate: vi.fn() });
        return usePluginLiveUpdates({ plugin: 'wago', topic: 'diagnostics', identifier: '1', onUpdate, enabled });
      },
      {
        initialProps: { enabled: false },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
          </QueryClientProvider>
        ),
      },
    );
    expect(state.clients).toHaveLength(1);
    const client = state.clients[0];
    expect(client.callbacks.size).toBe(1);
    hook.rerender({ enabled: true });
    expect(client.callbacks.size).toBe(2);
    client.callbacks.forEach((callback) => callback({ value: 3 }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    hook.result.current.abort();
    hook.result.current.abort();
    expect(client.callbacks.size).toBe(1);
    hook.rerender({ enabled: false });
    hook.rerender({ enabled: true });
    expect(client.callbacks.size).toBe(2);
    act(() => stopLiveUpdates());
    expect(client.callbacks.size).toBe(0);
    hook.unmount();
  });
  it('disabled hooks do not subscribe; enabling, abort and repeated unmount are safe in StrictMode', async () => {
    const queryClient = new QueryClient();
    const callback = vi.fn();
    const hook = renderHook(({ enabled }) => useLiveUpdates({ topic: 'messaging', onUpdate: callback, enabled }), {
      initialProps: { enabled: false },
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <LiveUpdatesProvider userId={1}>{children}</LiveUpdatesProvider>
          </QueryClientProvider>
        </StrictMode>
      ),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.clients.every((client) => client.callbacks.size === 0)).toBe(true);
    hook.rerender({ enabled: true });
    // StrictMode may construct a discarded memo value; inspect the subscribed owner.
    const active = state.clients.find((client) => client.callbacks.size > 0);
    if (!active) throw new Error('Missing subscribed provider client');
    expect(state.clients.reduce((count, client) => count + client.callbacks.size, 0)).toBe(1);
    expect(active.dispose).not.toHaveBeenCalled();
    active.callbacks.forEach((cb) => cb({ id: 1 }));
    expect(callback).toHaveBeenCalledTimes(1);
    hook.result.current.abort();
    hook.result.current.abort();
    expect(active.callbacks.size).toBe(0);
    hook.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(active.dispose).toHaveBeenCalled();
  });

  it('session replacement disposes the former user and logout clears callbacks immediately', async () => {
    const queryClient = new QueryClient();
    let userId = 1;
    const callback = vi.fn();
    const hook = renderHook(() => useLiveUpdates({ topic: 'billing', onUpdate: callback }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <LiveUpdatesProvider userId={userId}>{children}</LiveUpdatesProvider>
        </QueryClientProvider>
      ),
    });
    const first = state.clients[0];
    userId = 2;
    hook.rerender();
    await act(async () => {
      await Promise.resolve();
    });
    expect(first.callbacks.size).toBe(0);
    expect(first.dispose).toHaveBeenCalled();
    expect(state.clients[1].callbacks.size).toBe(1);
    act(() => stopLiveUpdates());
    expect(state.clients[1].callbacks.size).toBe(0);
    // A stale current-user query during logout must not recreate a connection.
    userId = 1;
    hook.rerender();
    expect(state.clients).toHaveLength(2);
    act(() => resumeLiveUpdates());
    expect(state.clients).toHaveLength(3);
    expect(state.clients[2].callbacks.size).toBe(1);
    hook.unmount();
  });
});
