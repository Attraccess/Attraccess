import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverview } from './index';

const state = vi.hoisted(() => ({ matches: 0, resources: 0, pending: false, queries: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceGroupsGetMany: () => ({ data: [] }),
  useResourcesServiceGetAllResources: (
    params: { search?: string; onlyWithPermissions?: boolean },
    _key: unknown,
    options: unknown,
  ) => {
    state.queries(params, options);
    const count = options ? state.resources : state.matches;
    return {
      data: options && state.pending ? undefined : { data: Array.from({ length: count }, () => ({ id: 1 })) },
      isLoading: false,
    };
  },
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

describe('ResourceOverview empty-state selection', () => {
  beforeEach(() => {
    localStorage.clear();
    state.matches = 0;
    state.resources = 0;
    state.pending = false;
    state.queries.mockClear();
  });

  it('checks resource existence without the default permission filter', () => {
    render(<ResourceOverview />);
    expect(state.queries).toHaveBeenCalledWith(
      { page: 1, limit: 1, onlyInUseByMe: false, onlyWithPermissions: false },
      { enabled: true },
    );
    expect(screen.getByRole('button', { name: 'First resource' })).toBeInTheDocument();
  });

  it('resets filters when resources exist outside the filtered results', () => {
    state.resources = 1;
    render(<ResourceOverview />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(localStorage.getItem('resourceOverview.toolbar.filter.onlyWithPermissions')).toBe('false');
    expect(localStorage.getItem('resourceOverview.toolbar.filter.onlyInUseByMe')).toBe('false');
  });

  it('waits for the existence check instead of flashing first-resource setup', () => {
    state.pending = true;
    render(<ResourceOverview />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not request an existence check when matching resources are visible', () => {
    state.matches = 1;
    render(<ResourceOverview />);
    expect(state.queries).toHaveBeenCalledWith(expect.anything(), { enabled: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
