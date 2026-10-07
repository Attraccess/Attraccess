import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpenAPI, UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveUpdatesProvider, stopLiveUpdates, useLiveUpdates } from '../utils/live-updates';
import { useAuth, useLogin } from './useAuth';

let queryClient: QueryClient;
const originalBase = OpenAPI.BASE;

afterEach(() => {
  cleanup();
  stopLiveUpdates();
  queryClient?.clear();
  OpenAPI.BASE = originalBase;
  vi.unstubAllGlobals();
});

it('keeps cached user data from restarting a stopped stream until two-factor login succeeds', async () => {
  stopLiveUpdates();
  OpenAPI.BASE = 'http://localhost';
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const cachedUser = { id: 1, username: 'two-factor-user' };
  queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), cachedUser);
  const streams: AbortSignal[] = [];
  let loginResponse: (response: Response) => void;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/api/auth/session/local') {
        return new Promise<Response>((resolve) => {
          loginResponse = resolve;
        });
      }
      if (path === '/api/users/me') return json(cachedUser);
      if (path === '/api/auth/two-factor') return json({ required: true, enabled: true });
      if (init.method === 'PUT') return new Response(null, { status: 204 });
      if (path.startsWith('/api/live-updates/') && path.endsWith('/events')) {
        const signal = init.signal;
        if (!signal) throw new Error('Missing transport signal');
        streams.push(signal);
        return new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener('abort', () => controller.close(), { once: true });
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  function AuthenticatedLiveUpdates({ children }: { children: React.ReactNode }) {
    const { user, needsTwoFactorSetup, isTwoFactorStatusLoading } = useAuth();
    return (
      <LiveUpdatesProvider userId={!isTwoFactorStatusLoading && !needsTwoFactorSetup ? user?.id : undefined}>
        {children}
      </LiveUpdatesProvider>
    );
  }
  const hook = renderHook(
    () => {
      useLiveUpdates({ topic: 'billing', onUpdate: vi.fn() });
      return useLogin();
    },
    {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <AuthenticatedLiveUpdates>{children}</AuthenticatedLiveUpdates>
          </QueryClientProvider>
        </MemoryRouter>
      ),
    },
  );
  const credentials = { username: cachedUser.username, password: 'fixture', tokenLocation: 'cookie' as const };
  for (const [twoFactorCode, message] of [
    [undefined, 'TwoFactorRequired'],
    ['000000', 'TwoFactorInvalidCode'],
  ]) {
    await act(async () => hook.result.current.mutate({ ...credentials, twoFactorCode }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(true));
    expect(streams).toHaveLength(0);
    await act(async () => loginResponse(json({ message }, 401)));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(queryClient.getQueryData(UseUsersServiceGetCurrentKeyFn())).toEqual(cachedUser);
    expect(streams).toHaveLength(0);
  }
  await act(async () => hook.result.current.mutate({ ...credentials, twoFactorCode: '123456' }));
  await waitFor(() => expect(hook.result.current.isPending).toBe(true));
  expect(streams).toHaveLength(0);
  await act(async () => loginResponse(json({ user: cachedUser, authToken: '' })));
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  await waitFor(() => expect(streams).toHaveLength(1));
  hook.unmount();
  await waitFor(() => expect(streams[0].aborted).toBe(true));
});
