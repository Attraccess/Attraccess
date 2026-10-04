import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveUpdatesProvider, resumeLiveUpdates, stopLiveUpdates, useLiveUpdates } from './live-updates';

const state = vi.hoisted(() => ({
  clients: [] as { callbacks: Set<(data: unknown) => void>; dispose: ReturnType<typeof vi.fn> }[],
}));
vi.mock('./live-update-client', () => ({
  LiveUpdateClient: class {
    callbacks = new Set<(data: unknown) => void>();
    dispose = vi.fn(() => this.callbacks.clear());
    constructor() {
      state.clients.push(this);
    }
    subscribe(_topic: unknown, callback: (data: unknown) => void) {
      this.callbacks.add(callback);
      return () => this.callbacks.delete(callback);
    }
  },
}));
beforeEach(() => resumeLiveUpdates());
afterEach(() => {
  stopLiveUpdates();
  state.clients.length = 0;
});

describe('live topic React lifecycle', () => {
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
    const active = state.clients.at(-1);
    if (!active) throw new Error('Missing provider client');
    expect(active.callbacks.size).toBe(0);
    expect(active.dispose).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
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
