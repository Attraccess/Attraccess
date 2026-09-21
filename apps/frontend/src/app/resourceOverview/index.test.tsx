import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverview } from './index';

const state = vi.hoisted(() => ({
  groups: [{ id: 1 }] as Array<{ id: number }> | undefined,
  resources: [] as Array<{ id: number; groupId: number; permitted: boolean }>,
  getResources: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceResourceGroupsGetMany: () => ({ data: state.groups }),
  ResourcesService: { getAllResources: (params: unknown) => state.getResources(params) },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useDebounce: (value: unknown) => value }));
vi.mock('./toolbar/toolbar', () => ({ Toolbar: () => null }));
vi.mock('./resourceGroupCard', () => ({ ResourceGroupCard: () => null }));
vi.mock('./activeUsageSessionsBanner', () => ({ ActiveUsageSessionsBanner: () => null }));
vi.mock('./noResourcesFound', () => ({
  NoResourcesFound: ({
    hasResources,
    onClearFilterAndSearch,
  }: {
    hasResources: boolean;
    onClearFilterAndSearch: () => void;
  }) => <button onClick={onClearFilterAndSearch}>{hasResources ? 'Reset filters' : 'First resource'}</button>,
}));

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    for (const groupId of [-1, 1]) {
      expect(state.getResources).toHaveBeenCalledWith({
        groupId,
        page: 1,
        limit: 1,
        onlyInUseByMe: false,
        onlyWithPermissions: false,
      });
    }
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
  });

  it('does not query unfiltered existence when a visible resource matches', async () => {
    state.resources = [{ id: 10, groupId: -1, permitted: true }];
    renderOverview();
    await waitFor(() => expect(state.getResources).toHaveBeenCalledTimes(2));
    expect(state.getResources.mock.calls.every(([params]) => params.onlyWithPermissions === true)).toBe(true);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
