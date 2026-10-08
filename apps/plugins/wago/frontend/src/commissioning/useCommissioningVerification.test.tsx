import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCommissioningVerification } from './useCommissioningVerification';

vi.mock('../api/client', () => ({ getCommissioningVerification: () => new Promise(() => undefined) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('expires cached enrollment evidence if the next poll stalls, then accepts a fresh check', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ['wago', 'commissioning-verification', 8];
  const evidence = {
    controllerId: 2,
    permanentConnection: true,
    enrollmentRevoked: true,
    configurationApplied: true,
    hardwareReadiness: 'ready',
  };
  client.setQueryData(key, evidence);
  const { result, unmount } = renderHook(
    () => useCommissioningVerification({ id: 8, state: 'awaiting_verification' }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.enrollmentComplete).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(16_000));
  expect(result.current.enrollmentComplete).toBe(false);
  expect(result.current.data).toBeUndefined();
  expect(result.current.unavailable).toBe(true);
  await act(async () => {
    client.setQueryData(key, { ...evidence });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.enrollmentComplete).toBe(true);
  expect(result.current.runtimeVerified).toBe(true);
  unmount();
  client.clear();
});
