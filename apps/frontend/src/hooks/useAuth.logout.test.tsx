import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpenAPI, UseUsersServiceGetCurrentKeyFn } from '@attraccess/react-query-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';

const messages = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../components/toastProvider', () => ({ useToastMessage: () => messages }));
let client: QueryClient;
let requestLog: { path: string; method: string }[];
let finish: (response: Response) => void;
let fail: (error: Error) => void;
const originalBase = OpenAPI.BASE;
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  requestLog = [];
  OpenAPI.BASE = 'http://localhost';
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(UseUsersServiceGetCurrentKeyFn(), { id: 7, username: 'fixture' });
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async (variables: { secret: string }) => ({ secret: variables.secret }),
  });
  await mutation.execute({ secret: 'private-mutation-data' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      requestLog.push({ path, method: init?.method ?? 'GET' });
      if (path === '/api/users/me') return json({ id: 7, username: 'fixture' });
      if (path === '/api/auth/two-factor') return json({ required: false, enabled: false });
      if (path === '/api/auth/session/logout-capability') return json({ available: true });
      if (path === '/api/auth/session/logout-everywhere' || path === '/api/auth/session')
        return new Promise<Response>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
      throw new Error(`Unexpected request ${url}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  OpenAPI.BASE = originalBase;
  vi.unstubAllGlobals();
});
function mount() {
  return renderHook(() => [useAuth(), useAuth()], {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

it('keeps local logout separate, disables duplicate submissions across hook users and clears protected cache after success', async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current[0].canLogoutEverywhere).toBe(true));
  client.setQueryData(['private-data'], 'sensitive-fixture');
  act(() => {
    hook.result.current[0].logout();
    hook.result.current[1].logoutEverywhere();
  });
  await waitFor(() => expect(hook.result.current[1].logoutPending).toBe(true));
  expect(requestLog.filter((request) => request.path === '/api/auth/session')).toEqual([
    { path: '/api/auth/session', method: 'DELETE' },
  ]);
  expect(requestLog.some((request) => request.path.endsWith('logout-everywhere'))).toBe(false);
  await act(async () => finish(json({})));
  await waitFor(() => expect(hook.result.current.every((auth) => !auth.isAuthenticated)).toBe(true));
  expect(client.getQueryData(['private-data'])).toBeUndefined();
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  act(() => hook.result.current[1].logoutEverywhere());
  expect(requestLog.filter((request) => request.path.endsWith('logout-everywhere'))).toHaveLength(0);
});

it('starts provider logout through the central endpoint and explains a local-only result', async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current[0].canLogoutEverywhere).toBe(true));
  act(() => {
    hook.result.current[0].logoutEverywhere();
    hook.result.current[1].logoutEverywhere();
  });
  await waitFor(() =>
    expect(requestLog.filter((request) => request.path.endsWith('logout-everywhere'))).toHaveLength(1),
  );
  await act(async () => finish(json({ kind: 'local_only', reason: 'provider_failed' })));
  await waitFor(() => expect(hook.result.current.every((auth) => !auth.isAuthenticated)).toBe(true));
  expect(messages.warning).toHaveBeenCalled();
  expect(requestLog.some((request) => request.method === 'DELETE')).toBe(false);
});

it('keeps every hook signed out after a lost response and reports that server logout is unconfirmed', async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current[0].isAuthenticated).toBe(true));
  act(() => hook.result.current[0].logoutEverywhere());
  await waitFor(() => expect(fail).toBeTypeOf('function'));
  await act(async () => fail(new Error('Network unavailable')));
  await waitFor(() => expect(hook.result.current.every((auth) => !auth.isAuthenticated)).toBe(true));
  expect(messages.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Logout could not be confirmed' }));
  expect(client.getQueryData(['auth-logout-status'])).toBe('ended');
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});

it.each(['failed', 'partial', 'returned'])(
  'does not claim sign-out from a fabricated %s outcome URL',
  async (outcome) => {
    window.history.replaceState(null, '', `/?ssoLogout=${outcome}`);
    const hook = mount();
    await waitFor(() => expect(hook.result.current[0].isAuthenticated).toBe(true));
    expect(messages.info).not.toHaveBeenCalled();
  },
);

const resultToken = 'r'.repeat(43);
function mockReturn(outcome: string, authenticated: boolean, valid = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      requestLog.push({ path, method: init?.method ?? 'GET' });
      if (path === '/api/auth/sso/logout-result')
        return valid ? json({ result: outcome }) : new Response('{}', { status: 400 });
      if (path === '/api/users/me')
        return authenticated ? json({ id: 7, username: 'fixture' }) : new Response('{}', { status: 401 });
      if (path === '/api/auth/two-factor') return json({ required: false, enabled: false });
      if (path === '/api/auth/session/logout-capability') return json({ available: true });
      throw new Error(`Unexpected request ${url}`);
    }),
  );
  window.history.replaceState(null, '', `/?ssoLogout=${resultToken}`);
}

it.each(['failed', 'partial', 'returned'])(
  'shows a verified %s return once after confirming local sign-out',
  async (outcome) => {
    client.clear();
    mockReturn(outcome, false);
    const hook = mount();
    await waitFor(() => expect(messages.info).toHaveBeenCalledTimes(1));
    expect(requestLog.filter(({ path }) => path === '/api/auth/sso/logout-result')).toHaveLength(1);
    expect(hook.result.current[0].isAuthenticated).toBe(false);
    expect(window.location.search).toBe('');
    hook.unmount();
    window.history.replaceState(null, '', `/?ssoLogout=${resultToken}`);
    mount();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(messages.info).toHaveBeenCalledTimes(1);
  },
);

it('does not claim sign-out for a valid old result when the browser has signed in again', async () => {
  mockReturn('partial', true);
  const hook = mount();
  await waitFor(() => expect(window.location.search).toBe(''));
  expect(hook.result.current[0].isAuthenticated).toBe(true);
  expect(messages.info).not.toHaveBeenCalled();
});

it('ignores fabricated or consumed result tokens even when signed out', async () => {
  client.clear();
  mockReturn('partial', false, false);
  mount();
  await waitFor(() => expect(window.location.search).toBe(''));
  expect(messages.info).not.toHaveBeenCalled();
});
