import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCommissioningSessionsQuery } from './queries';

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

it('keeps commissioning progress current when the browser loses focus', async () => {
  focusManager.setFocused(false);
  let percent = 20;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify([{ id: 1, progressPercent: percent }]),
    })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useCommissioningSessionsQuery(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  try {
    await waitFor(() => expect(result.current.data?.[0].progressPercent).toBe(20));
    percent = 100;
    await waitFor(() => expect(result.current.data?.[0].progressPercent).toBe(100), { timeout: 3500 });
  } finally {
    client.clear();
  }
});
