import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceDiagnostics } from './ResourceDiagnostics';
import type { WagoResourceDiagnostics } from '../../diagnostics-types';

vi.mock('./ControllerDiagnostics', () => ({
  WagoDiagnosticsBoundary: ({ children }: { children: import('react').ReactNode }) => children,
  ControllerDiagnostics: ({ controllerId }: { controllerId: number }) => <p>Details for controller {controllerId}</p>,
}));
let client: QueryClient;
let allowed: boolean;
let listeners: Set<() => void>;
const access = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => allowed,
};
const fixture: WagoResourceDiagnostics = {
  resourceId: 4,
  invalidControllerReferences: 2,
  truncated: true,
  controllers: [
    {
      controllerId: 7,
      name: 'Workshop',
      unavailable: true,
      referencesTruncated: true,
      references: [
        {
          nodeId: 'node-1',
          resourceId: 4,
          channelId: 'output',
          control: true,
          href: '/resources/4/flows',
          invalid: true,
          conflict: true,
        },
      ],
    },
  ],
};
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  allowed = true;
  listeners = new Set();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(fixture) })),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ResourceDiagnostics resourceId={4} access={access} />
    </QueryClientProvider>,
  );
it('shows reference warnings, opens scoped details, and unmounts cached data on permission loss', async () => {
  mount();
  const open = await screen.findByRole('button', { name: 'Open WAGO diagnostics: Workshop' });
  expect(screen.getByText('Invalid flow reference. Open diagnostics to review.')).toBeTruthy();
  expect(screen.getByText('Channel also controlled by another resource.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Review node node-1' }).getAttribute('href')).toBe('/resources/4/flows');
  expect(screen.getByText(/Invalid controller references: 2/)).toBeTruthy();
  fireEvent.click(open);
  expect(screen.getByText('Details for controller 7')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close WAGO diagnostics: Workshop' }));
  expect(screen.queryByText('Details for controller 7')).toBeNull();
  act(() => {
    allowed = false;
    listeners.forEach((listener) => listener());
  });
  expect(screen.queryByRole('region', { name: 'Resource WAGO diagnostics' })).toBeNull();
});
it('does not fetch diagnostics without permission', () => {
  allowed = false;
  mount();
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps resource controls independent from failed diagnostics', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('Unavailable'));
  mount();
  expect(await screen.findByText('WAGO diagnostics unavailable. Resource controls remain available.')).toBeTruthy();
});
it('renders nothing for a resource with no controller references', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ controllers: [], invalidControllerReferences: 0, truncated: false })),
  );
  mount();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByRole('region', { name: 'Resource WAGO diagnostics' })).toBeNull();
});
