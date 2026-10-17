import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourcesServiceGetAllResourcesKey } from '@attraccess/react-query-client';
import { ResourceOverview } from './index';

const state = vi.hoisted(() => ({
  groups: [{ id: 1 }] as Array<{ id: number }> | undefined,
  resources: [] as Array<{ id: number; groupId: number; permitted: boolean }>,
  getResources: vi.fn(),
  getExistence: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceResourceGroupsGetMany: () => ({ data: state.groups }),
  ResourcesService: {
    getAllResources: (params: unknown) => state.getResources(params),
    resourceGroupsResourcesExist: () => state.getExistence(),
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useDebounce: (value: unknown) => value }));
vi.mock('./toolbar/toolbar', () => ({ Toolbar: () => null }));
vi.mock('./resourceGroupCard', () => ({ ResourceGroupCard: () => null }));
vi.mock('./activeUsageSessionsBanner', () => ({ ActiveUsageSessionsBanner: () => null }));
vi.mock('./createResourceDrawer', () => ({
  CreateResourceDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen && <div role="dialog" aria-label="Create another" />,
}));
vi.mock('./noResourcesFound', () => ({
  NoResourcesFound: ({
    hasResources,
    onClearFilterAndSearch,
    onOpenCreate,
  }: {
    hasResources: boolean;
    onClearFilterAndSearch: () => void;
    onOpenCreate: () => void;
  }) => (
    <button onClick={hasResources ? onClearFilterAndSearch : onOpenCreate}>
      {hasResources ? 'Reset filters' : 'First resource'}
    </button>
  ),
}));

function renderOverview(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <ResourceOverview />
    </QueryClientProvider>,
  );
}

describe('ResourceOverview empty-state selection', () => {
  beforeEach(() => {
    localStorage.clear();
    state.groups = [{ id: 1 }];
    state.resources = [];
    state.getExistence.mockReset().mockImplementation(async () => ({
      hasResources: state.resources.some(
        (resource) => resource.groupId === -1 || state.groups?.some((group) => group.id === resource.groupId),
      ),
    }));
    state.getResources
      .mockReset()
      .mockImplementation(async (params: { groupId?: number; onlyWithPermissions?: boolean }) => ({
        data: state.resources.filter(
          (resource) =>
            (params.groupId === undefined || params.groupId === resource.groupId) &&
            (!params.onlyWithPermissions || resource.permitted),
        ),
      }));
  });

  it('checks existence in the visible groups without the default permission filter', async () => {
    renderOverview();
    expect(await screen.findByRole('button', { name: 'First resource' })).toBeInTheDocument();
    expect(state.getExistence).toHaveBeenCalledTimes(1);
    expect(state.getResources.mock.calls.every(([params]) => params.onlyWithPermissions === true)).toBe(true);
  });

  it('ignores resources belonging only to a hidden group, even after filters are cleared', async () => {
    state.resources = [{ id: 20, groupId: 99, permitted: false }];
    localStorage.setItem('resourceOverview.toolbar.filter.onlyWithPermissions', 'false');
    renderOverview();
    expect(await screen.findByRole('button', { name: 'First resource' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
    expect(state.getResources.mock.calls.every(([params]) => [-1, 1].includes(params.groupId))).toBe(true);
  });

  it('preserves filter recovery for visible-group resources and reveals matches after reset', async () => {
    state.resources = [
      { id: 10, groupId: 1, permitted: false },
      { id: 20, groupId: 99, permitted: false },
    ];
    renderOverview();
    fireEvent.click(await screen.findByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
    expect(localStorage.getItem('resourceOverview.toolbar.filter.onlyWithPermissions')).toBe('false');
    expect(localStorage.getItem('resourceOverview.toolbar.filter.onlyInUseByMe')).toBe('false');
  });

  it('waits for visible group discovery before deciding the list is empty', () => {
    state.groups = undefined;
    renderOverview();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(state.getResources).not.toHaveBeenCalled();
    expect(state.getExistence).not.toHaveBeenCalled();
  });

  it('does not query unfiltered existence when a visible resource matches', async () => {
    state.resources = [{ id: 10, groupId: -1, permitted: true }];
    renderOverview();
    await waitFor(() => expect(state.getResources).toHaveBeenCalledTimes(2));
    expect(state.getResources.mock.calls.every(([params]) => params.onlyWithPermissions === true)).toBe(true);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(state.getExistence).not.toHaveBeenCalled();
  });

  it('uses one unfiltered request regardless of the number of visible groups', async () => {
    state.groups = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
    renderOverview();
    expect(await screen.findByRole('button', { name: 'First resource' })).toBeInTheDocument();
    expect(state.getResources).toHaveBeenCalledTimes(101);
    expect(state.getExistence).toHaveBeenCalledTimes(1);
  });
  it('refreshes visibility when the existing resource mutation cache prefix is invalidated', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderOverview(client);
    expect(await screen.findByRole('button', { name: 'First resource' })).toBeInTheDocument();
    state.resources = [{ id: 10, groupId: 1, permitted: false }];
    await act(async () => {
      await client.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
    });
    expect(await screen.findByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
    expect(state.getExistence).toHaveBeenCalledTimes(2);
  });

  it('keeps creation open when the empty state disappears after a resource is created', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderOverview(client);
    fireEvent.click(await screen.findByRole('button', { name: 'First resource' }));
    expect(screen.getByRole('dialog', { name: 'Create another' })).toBeInTheDocument();

    state.resources = [{ id: 10, groupId: 1, permitted: true }];
    await act(async () => {
      await client.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'First resource' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Create another' })).toBeInTheDocument();
  });
});
