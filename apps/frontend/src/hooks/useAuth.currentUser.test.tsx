import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { client as apiClient, UseGetCurrentKeyFn } from '@attraccess/react-query-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';
import { restoreAuthentication } from '../utils/auth-session';
import { DEFAULT_RETRIES } from '../api/retryRules';

vi.mock('../components/toastProvider', () => ({
  useToastMessage: () => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

type Answer = Response | Error;
let client: QueryClient;
let answers: Answer[];
let meRequests: number;
const originalBase = apiClient.getConfig().baseUrl;
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const status = (code: number) => new Response('{}', { status: code, headers: { 'Content-Type': 'application/json' } });
const user = { id: 7, username: 'fixture' };

beforeEach(() => {
  meRequests = 0;
  answers = [];
  apiClient.setConfig({ baseUrl: 'http://localhost' });
  // No backoff delay in tests; the retry count comes from useAuth's own rule.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/api/users/me') {
        meRequests++;
        // The last answer repeats, so a persistent failure needs only one entry.
        const answer = answers.length > 1 ? answers.shift()! : answers[0];
        if (answer instanceof Error) throw answer;
        return answer.clone();
      }
      if (path === '/api/auth/two-factor') return json({ required: false, enabled: false });
      if (path === '/api/auth/session/logout-capability') return json({ available: true });
      if (path === '/api/auth/session') return json({});
      throw new Error(`Unexpected request ${path}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  apiClient.setConfig({ baseUrl: originalBase });
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
const statusOf = (hook: ReturnType<typeof mount>) => hook.result.current.map((auth) => auth.authStatus);

it('starts in the loading state and shows a 401 as signed out without retrying', async () => {
  answers = [status(401)];
  const hook = mount();
  expect(statusOf(hook)).toEqual(['loading', 'loading']);
  await waitFor(() => expect(statusOf(hook)).toEqual(['unauthenticated', 'unauthenticated']));
  expect(meRequests).toBe(1);
  expect(hook.result.current[0].isAuthenticated).toBe(false);
});

it(`retries a 503 ${DEFAULT_RETRIES} times while loading, then reports an error instead of signing out`, async () => {
  answers = [status(503)];
  const hook = mount();
  const seen = new Set<string>();
  await waitFor(() => {
    hook.result.current.forEach((auth) => seen.add(auth.authStatus));
    expect(statusOf(hook)).toEqual(['error', 'error']);
  });
  expect(meRequests).toBe(DEFAULT_RETRIES + 1);
  expect(seen.has('unauthenticated')).toBe(false);
  expect(hook.result.current[0].user).toBeNull();
});

it('signs in normally when a 503 is followed by a 200', async () => {
  answers = [status(503), status(503), json(user)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)).toEqual(['authenticated', 'authenticated']));
  expect(meRequests).toBe(3);
  expect(hook.result.current[0].user).toEqual(user);
});

it('retries a network error, then reports an error', async () => {
  answers = [new TypeError('Failed to fetch')];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)).toEqual(['error', 'error']));
  expect(meRequests).toBe(DEFAULT_RETRIES + 1);
});

it('recovers from the error state through retryCurrentUser, or lands on sign-in after a 401', async () => {
  answers = [status(503)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('error'));
  answers = [json(user)];
  act(() => hook.result.current[0].retryCurrentUser());
  await waitFor(() => expect(statusOf(hook)).toEqual(['authenticated', 'authenticated']));

  client.clear();
  answers = [status(503)];
  const again = mount();
  await waitFor(() => expect(statusOf(again)[0]).toBe('error'));
  answers = [status(401)];
  act(() => again.result.current[1].retryCurrentUser());
  await waitFor(() => expect(statusOf(again)).toEqual(['unauthenticated', 'unauthenticated']));
});

it('keeps the sign-in page mounted while a signed-out answer is refetched (window focus, interval)', async () => {
  answers = [status(401)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('unauthenticated'));
  const seen = new Set<string>();
  await act(async () => {
    const refetch = client.refetchQueries({ queryKey: UseGetCurrentKeyFn() });
    hook.result.current.forEach((auth) => seen.add(auth.authStatus));
    await refetch;
  });
  hook.result.current.forEach((auth) => seen.add(auth.authStatus));
  expect([...seen]).toEqual(['unauthenticated']);
  expect(meRequests).toBe(2);
});

it('keeps the error state, with the request shown as running, while Retry is in flight', async () => {
  answers = [status(503)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('error'));
  let release!: () => void;
  vi.mocked(fetch).mockImplementationOnce(
    () => new Promise<Response>((resolve) => (release = () => resolve(json(user)))),
  );
  act(() => hook.result.current[0].retryCurrentUser());
  await waitFor(() => expect(hook.result.current[0].isCurrentUserFetching).toBe(true));
  expect(statusOf(hook)).toEqual(['error', 'error']);
  await act(async () => release());
  await waitFor(() => expect(statusOf(hook)).toEqual(['authenticated', 'authenticated']));
});

it('keeps a loaded user signed in when a background refetch answers 401 (unchanged behaviour)', async () => {
  answers = [json(user)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('authenticated'));
  answers = [status(401)];
  await act(async () => {
    await client.refetchQueries({ queryKey: UseGetCurrentKeyFn() });
  });
  await waitFor(() => expect(client.getQueryState(UseGetCurrentKeyFn())?.status).toBe('error'));
  expect(statusOf(hook)).toEqual(['authenticated', 'authenticated']);
});

it('keeps a loaded user signed in when a background refetch fails', async () => {
  answers = [json(user)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('authenticated'));
  answers = [status(503)];
  await act(async () => {
    await client.refetchQueries({ queryKey: UseGetCurrentKeyFn() });
  });
  await waitFor(() => expect(client.getQueryState(UseGetCurrentKeyFn())?.status).toBe('error'));
  expect(statusOf(hook)).toEqual(['authenticated', 'authenticated']);
  expect(hook.result.current[0].user).toEqual(user);
});

it('ends on the sign-in page after logout, and shows the error (not sign-in) when the next sign-in reload fails', async () => {
  answers = [json(user)];
  const hook = mount();
  await waitFor(() => expect(statusOf(hook)[0]).toBe('authenticated'));
  act(() => hook.result.current[0].logout());
  await waitFor(() => expect(statusOf(hook)).toEqual(['unauthenticated', 'unauthenticated']));
  expect(client.getQueryData(UseGetCurrentKeyFn())).toBeNull();

  // A successful sign-in restores authentication; the following user reload keeps failing.
  answers = [status(503)];
  await act(async () => {
    await restoreAuthentication(client);
  });
  await waitFor(() => expect(statusOf(hook)).toEqual(['error', 'error']));
});
