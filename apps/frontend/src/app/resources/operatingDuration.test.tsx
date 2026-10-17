import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { useOperatingDuration } from './operatingDuration';

vi.mock('../../api', () => ({ getBaseUrl: () => '' }));
vi.mock('../../utils/sse', () => ({ useSSE: () => ({}) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('skips empty history intervals while still fetching bounded and current operating time', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ attributions: [] })));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const start = new Date('2026-10-05T10:00:00Z');
  const end = new Date('2026-10-05T11:00:00Z');
  const { result, rerender, unmount } = renderHook(
    ({ range }: { range?: { start: Date; end: Date } }) => useOperatingDuration(2, true, range),
    {
      initialProps: { range: { start, end: start } },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.fetchStatus).toBe('idle');
  expect(fetch).not.toHaveBeenCalled();

  rerender({ range: { start, end } });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetch).toHaveBeenCalledWith(
    '/api/resources/2/operating-attribution?start=2026-10-05T10%3A00%3A00.000Z&end=2026-10-05T11%3A00%3A00.000Z',
    { credentials: 'include' },
  );

  // Each request consumes its response body.
  fetch.mockResolvedValue(new Response(JSON.stringify({ attributions: [] })));
  rerender({});
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetch).toHaveBeenLastCalledWith('/api/resources/2/operating-attribution', { credentials: 'include' });
  expect(fetch).toHaveBeenCalledTimes(2);
  unmount();
  client.clear();
});
