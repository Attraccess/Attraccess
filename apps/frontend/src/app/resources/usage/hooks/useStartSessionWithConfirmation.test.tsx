import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { useStartSessionWithConfirmation } from './useStartSessionWithConfirmation';

const state = vi.hoisted(() => ({
  settle: { resolve: (_value: unknown) => undefined, reject: (_error: unknown) => undefined } as {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  },
  toastError: vi.fn(),
}));

vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ error: state.toastError }),
}));
// The real TanStack mutation, with a request the test settles by hand.
vi.mock('@attraccess/react-query-client', async (original) => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    ...(await original<typeof import('@attraccess/react-query-client')>()),
    useResourcesServiceResourceUsageStartSession: (options: object) =>
      useMutation({
        mutationFn: () =>
          new Promise((resolve, reject) => {
            state.settle = { resolve, reject };
          }),
        ...options,
      }),
  };
});

const startError = (status: number, body: unknown) =>
  new ApiError({ method: 'POST', url: '/start' }, { url: '/start', ok: false, status, statusText: 'x', body }, 'x');

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(cleanup);

function setup() {
  const options = { onSuccess: vi.fn(), onError: vi.fn() };
  const view = renderHook(() => useStartSessionWithConfirmation(3, options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, options };
}

it('still reports success when the start control unmounts before the reply', async () => {
  const { result, unmount, options } = setup();
  act(() => result.current.start({ notes: 'n' }));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  unmount(); // the session-started event swapped the start control out
  await act(async () => state.settle.resolve({}));
  await waitFor(() => expect(options.onSuccess).toHaveBeenCalledWith({ notes: 'n' }));
});

it('still reports a generic error after unmount, but never a plugin confirmation or block', async () => {
  const { result, unmount, options } = setup();
  act(() => result.current.start({}));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  await act(async () =>
    state.settle.reject(
      startError(409, { code: 'CONFIRMATION_REQUIRED', stepId: 's1', confirmation: { title: 'T', body: 'B' } }),
    ),
  );
  await waitFor(() => expect(result.current.dialog).not.toBeNull());
  act(() => result.current.start({}));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  await act(async () =>
    state.settle.reject(startError(403, { code: 'START_BLOCKED', reason: { code: 'R', title: 'T', body: 'B' } })),
  );
  await waitFor(() => expect(state.toastError).toHaveBeenCalledWith({ title: 'T', description: 'B' }));
  expect(options.onError).not.toHaveBeenCalled();

  act(() => result.current.start({}));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  unmount();
  const failure = startError(500, {});
  await act(async () => state.settle.reject(failure));
  await waitFor(() => expect(options.onError).toHaveBeenCalledWith(failure, {}));
});
