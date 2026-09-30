import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceDiagnostics } from './ResourceDiagnostics';
import type { WagoResourceDiagnostics } from '../../diagnostics-types';

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
          conflictResourceIds: [9],
          conflictResources: [{ id: 9, name: 'Workbench outlet' }],
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
const respond = (body: unknown) => vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
it('groups problems per node, dedupes repeated references, and unmounts on permission loss', async () => {
  const [reference] = fixture.controllers[0].references;
  respond({ ...fixture, controllers: [{ ...fixture.controllers[0], references: [reference, reference] }] });
  mount();
  expect(await screen.findByText('WAGO setup needs attention')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'node-1' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'node-1' }).getAttribute('href')).toBe('/resources/4/flows');
  expect(screen.getByText(/channel missing or outdated/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Workbench outlet' }).getAttribute('href')).toBe('/resources/9');
  expect(screen.getByRole('link', { name: 'Workshop' }).getAttribute('href')).toBe('/wago/controllers/7/configuration');
  expect(screen.getByText(/2 flow node\(s\) have no valid controller/)).toBeTruthy();
  act(() => {
    allowed = false;
    listeners.forEach((listener) => listener());
  });
  expect(screen.queryByText('WAGO setup needs attention')).toBeNull();
});
it('does not fetch diagnostics without permission', () => {
  allowed = false;
  mount();
  expect(fetch).not.toHaveBeenCalled();
});
it('stays silent when the lookup fails', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('Unavailable'));
  const { container } = mount();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(container.textContent).toBe('');
});
it('stays silent for a healthy WAGO setup', async () => {
  respond({
    resourceId: 4,
    invalidControllerReferences: 0,
    truncated: false,
    controllers: [
      {
        ...fixture.controllers[0],
        unavailable: false,
        referencesTruncated: false,
        references: [{ ...fixture.controllers[0].references[0], invalid: false, conflict: false }],
      },
    ],
  });
  const { container } = mount();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(container.textContent).toBe('');
});
