import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { afterEach, expect, it, vi } from 'vitest';
import { useCommissioningSessionsQuery } from '../api/queries';

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

it('keeps commissioning progress current when the browser loses focus', async () => {
  focusManager.setFocused(false);
  let deliver: (payload: unknown) => void;
  const remove = vi.fn();
  const live: PluginLiveUpdatesClient = {
    subscribe: vi.fn((subscription, callback) => {
      expect(subscription).toEqual({ topic: 'plugin:wago:commissioning-sessions' });
      deliver = callback;
      return remove;
    }),
  };
  const fetch = vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify([{ id: 1, progressPercent: 20 }]),
  }));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, unmount } = renderHook(() => useCommissioningSessionsQuery(), {
    wrapper: ({ children }) => (
      <PluginLiveUpdatesProvider client={live}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </PluginLiveUpdatesProvider>
    ),
  });
  try {
    await waitFor(() => expect(result.current.data?.[0].progressPercent).toBe(20));
    act(() => deliver({ eventType: 'snapshot', value: [{ id: 1, progressPercent: 100 }] }));
    await waitFor(() => expect(result.current.data?.[0].progressPercent).toBe(100));
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    client.clear();
  }
});
