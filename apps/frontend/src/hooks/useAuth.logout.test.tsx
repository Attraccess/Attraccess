import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpenAPI, UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { useDateTimePreferences } from '@attraccess/plugins-frontend-ui';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';
import { useDateTimePreferencesSync } from './useDateTimePreferencesSync';

const originalConfig = { ...OpenAPI };
let queryClient: QueryClient;

afterEach(() => {
  cleanup();
  queryClient?.clear();
  useDateTimePreferences.setState({ userId: null, dateTimeLocale: null });
  Object.assign(OpenAPI, originalConfig);
  vi.unstubAllGlobals();
});

it('keeps every auth consumer and shared formatting signed out while logout is pending', async () => {
  OpenAPI.BASE = 'http://localhost';
  const user = { id: 1, username: 'account-a', dateTimeLocale: 'en-GB' };
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), user);
  let releaseLogout: (response: Response) => void;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === '/api/auth/session' && init.method === 'DELETE') {
      return new Promise<Response>((resolve) => {
        releaseLogout = resolve;
      });
    }
    const data = path === '/api/users/me' ? user : { required: false, enabled: false };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(
    () => {
      useDateTimePreferencesSync();
      return { menu: useAuth(), otherConsumer: useAuth() };
    },
    {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    },
  );
  await waitFor(() => expect(useDateTimePreferences.getState().dateTimeLocale).toBe('en-GB'));
  act(() => result.current.menu.logout());
  await waitFor(() => expect(releaseLogout).toBeDefined());
  await waitFor(() => expect(useDateTimePreferences.getState()).toEqual({ userId: null, dateTimeLocale: null }));

  // A late response or another consumer updating the cache must not rehydrate A.
  act(() => queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), user));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: UseUsersServiceGetCurrentKeyFn() });
  });
  expect(result.current.menu.user).toBeNull();
  expect(result.current.otherConsumer.isAuthenticated).toBe(false);
  expect(useDateTimePreferences.getState()).toEqual({ userId: null, dateTimeLocale: null });
  expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/users/me')).toHaveLength(0);

  // A failed logout leaves the existing server session usable, rather than
  // disabling authentication queries permanently.
  await act(async () => {
    releaseLogout(new Response(JSON.stringify({ message: 'Logout failed' }), { status: 500 }));
  });
  await waitFor(() => expect(result.current.menu.user?.id).toBe(user.id));
  await waitFor(() => expect(useDateTimePreferences.getState().dateTimeLocale).toBe('en-GB'));
});
