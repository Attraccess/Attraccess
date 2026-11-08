// Shared helpers for the component specs: a routed fetch mock and a query-client wrapper.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: Call) => { status?: number; body?: unknown } | undefined;

/** Routes `fetch` by "METHOD /path-without-query"; unknown routes answer 404. */
export function mockFetch(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const call: Call = {
        method,
        path: url.pathname.replace(/^\/api\/reservations/, '') || '/',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const route = routes[`${method} ${url.pathname}`] ?? routes[`${method} ${call.path}`];
      const result =
        typeof route === 'function' ? (route as Handler)(call) : route === undefined ? undefined : { body: route };
      const status = result?.status ?? (route === undefined ? 404 : 200);
      const text = result?.body === undefined ? '' : JSON.stringify(result.body);
      return { ok: status < 400, status, text: async () => text };
    }),
  );
  return calls;
}

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export const reservationFixture = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  resourceId: 3,
  resourceName: 'Laser',
  startTime: '2031-06-02T08:00:00.000Z',
  endTime: '2031-06-02T10:00:00.000Z',
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  status: 'confirmed',
  mine: true,
  userId: 1,
  userName: 'Ada',
  note: null,
  createdAt: null,
  endedEarlyAt: null,
  cancelledBy: null,
  cancelReason: null,
  decidedBy: null,
  decisionReason: null,
  decidedAt: null,
  checkedInAt: null,
  canCancel: true,
  canEndEarly: false,
  canKeep: true,
  canDecide: false,
  ...extra,
});
