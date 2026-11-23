import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverview } from './index';

// The overview with the real empty state; the list answer decides which one is shown (ATT-843).
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  visibilityScope: 'permitted' as 'all' | 'permitted',
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourceGroupsGetMany: () => ({ data: [{ id: 1 }] }),
  getAllResources: async () => ({
    data: { data: [], total: 0, page: 1, limit: 10, visibilityScope: state.visibilityScope },
  }),
  resourceGroupsResourcesExist: async () => ({ data: { hasResources: false } }),
}));
// Keys instead of texts, so the assertions do not depend on the wording.
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useDebounce: (value: unknown) => value,
    useTranslations: () => ({ t: (key: string) => key }),
  }))()),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('./createResourceButton', () => ({ CreateResourceButton: () => <button>Create resource</button> }));
vi.mock('./toolbar/toolbar', () => ({ Toolbar: () => null }));
vi.mock('./resourceGroupCard', () => ({ ResourceGroupCard: () => null }));
vi.mock('./activeUsageSessionsBanner', () => ({ ActiveUsageSessionsBanner: () => null }));
vi.mock('./createResourceDrawer', () => ({ CreateResourceDrawer: () => null }));

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/resources']}>
        <ResourceOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResourceOverview with a narrowed machine list', () => {
  beforeEach(() => {
    state.permissions = [];
    state.visibilityScope = 'permitted';
  });

  it('explains that machines appear after an introduction when the narrowed list is empty', async () => {
    renderOverview();
    expect(await screen.findByRole('heading', { name: 'restricted.title' })).toBeInTheDocument();
    expect(screen.getByText('restricted.description')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'firstResource.title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the ordinary empty state when the list is not narrowed', async () => {
    state.visibilityScope = 'all';
    renderOverview();
    expect(await screen.findByRole('heading', { name: 'firstResource.title' })).toBeInTheDocument();
    expect(screen.queryByText('restricted.title')).not.toBeInTheDocument();
  });

  it('offers creation instead to someone who may create machines', async () => {
    state.permissions = ['resources.create'];
    renderOverview();
    expect(await screen.findByRole('heading', { name: 'firstResource.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create resource' })).toBeInTheDocument();
  });
});
