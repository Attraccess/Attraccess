import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveUsageSessionsBanner } from './index';
const state = vi.hoisted(() => ({
  total: 2,
  loading: false,
  listLoading: false,
  resources: [
    { id: 1, name: 'Lathe' },
    { id: 2, name: 'Saw' },
  ],
  end: vi.fn(),
  getActive: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  restricted: new Set<string>(),
  onError: undefined as undefined | ((error: unknown) => void),
  onSuccess: undefined as undefined | ((data: { resourceId: number }) => void),
}));
vi.mock('../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  }))()),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: state.success }) }));
vi.mock('../../../utils/apiError', () => ({
  getTranslationKeyForApiError: () => ({ key: 'api.denied', errorMessage: 'Denied' }),
  isNetworkRestrictedError: (error: { body?: { message?: string } }) => error?.body?.message === 'NETWORK_RESTRICTED',
}));
vi.mock('@attraccess/react-query-client', () => ({
  useGetAllResourcesKey: 'resources',
  UseGetAllResourcesKeyFn: (params: unknown) => ['resources', params],
  resourceUsageGetActiveSession: async ({ path }: { path: { resourceId: number } }) => ({
    data: await state.getActive(path),
  }),
  UseResourceUsageGetActiveSessionKeyFn: ({ path: { resourceId } }: { path: { resourceId: number } }) => [
    'active',
    resourceId,
  ],
  useGetAllResources: ({ query: { limit } }: { query: { limit: number } }) =>
    limit === 1
      ? { data: { total: state.total }, isLoading: state.loading, refetch: state.refetch }
      : { data: { data: state.resources }, isLoading: state.listLoading },
  useGetNetworkRestrictionStatusKey: 'network-status',
  useResourceUsageEndSession: (
    _mutationKey: unknown,
    { onSuccess, onError }: { onSuccess: typeof state.onSuccess; onError: typeof state.onError },
  ) => {
    state.onSuccess = onSuccess;
    state.onError = onError;
    return { mutateAsync: state.end };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.total = 2;
  state.loading = false;
  state.listLoading = false;
  state.restricted = new Set();
  state.resources = [
    { id: 1, name: 'Lathe' },
    { id: 2, name: 'Saw' },
  ];
  state.end.mockImplementation(async ({ path: { resourceId } }: { path: { resourceId: number } }) => {
    state.onSuccess?.({ resourceId });
  });
  // Each resource holds my session (user 1, usage id = resource id * 10) next to someone else's.
  state.getActive.mockImplementation(async ({ resourceId }: { resourceId: number }) => ({
    usages: [
      { id: resourceId * 10 + 1, userId: 2 },
      { id: resourceId * 10, userId: 1 },
    ],
  }));
});
afterEach(cleanup);
it('shows loading, hides an empty banner and filters to the current user sessions', () => {
  state.loading = true;
  let view = render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  expect(screen.getByText('loadingDescription')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.total = 0;
  view = render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  expect(view.container).toBeEmptyDOMElement();
  view.unmount();
  state.total = 2;
  const show = vi.fn();
  render(<ActiveUsageSessionsBanner onShowMySessions={show} />);
  fireEvent.click(screen.getByRole('button', { name: 'showMine' }));
  expect(show).toHaveBeenCalledOnce();
});
it('waits for the active resource list and supports cancelling', async () => {
  state.listLoading = true;
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'endAll' }));
  expect(await screen.findByText('modal.loadingList')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'modal.confirm' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'modal.cancel' }));
  expect(state.end).not.toHaveBeenCalled();
});
it('ends all sessions and invalidates both resource and active-session caches', async () => {
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'endAll' }));
  fireEvent.click(await screen.findByRole('button', { name: 'modal.confirm' }));
  await screen.findByText('modal.completedTitle');
  expect(state.end).toHaveBeenCalledWith({ path: { resourceId: 1 }, body: { usageId: 10 } });
  expect(state.end).toHaveBeenCalledWith({ path: { resourceId: 2 }, body: { usageId: 20 } });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['active', 1] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(state.success).toHaveBeenCalledWith({ title: 'endedAll.success' });
});
it('keeps partial failures visible alongside successful resources', async () => {
  state.end.mockImplementation(async ({ path: { resourceId } }: { path: { resourceId: number } }) => {
    if (resourceId === 2) throw new Error('Denied');
    state.onSuccess?.({ resourceId });
  });
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'endAll' }));
  fireEvent.click(await screen.findByRole('button', { name: 'modal.confirm' }));
  expect(await screen.findByText('api.denied.description')).toBeTruthy();
  expect(screen.getByText('modal.successListTitle')).toBeTruthy();
  expect(screen.queryByText('modal.completedTitle')).toBeNull();
  expect(state.success).not.toHaveBeenCalled();
  await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
});
it('treats a resource where I no longer have a session as done without ending anything', async () => {
  state.getActive.mockImplementation(async ({ resourceId }: { resourceId: number }) => ({
    usages: resourceId === 2 ? [{ id: 21, userId: 2 }] : [{ id: 10, userId: 1 }],
  }));
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'endAll' }));
  fireEvent.click(await screen.findByRole('button', { name: 'modal.confirm' }));
  await screen.findByText('modal.completedTitle');
  expect(state.end).toHaveBeenCalledExactlyOnceWith({ path: { resourceId: 1 }, body: { usageId: 10 } });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['active', 2] });
  expect(state.success).toHaveBeenCalledWith({ title: 'endedAll.success' });
});
it('keeps End all visible but disabled outside the allowed network, and says why', () => {
  state.restricted = new Set(['usage.end']);
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'endAll' })).toBeDisabled();
  expect(screen.getByRole('note').textContent).toBe('onlyLocal');
});
it('asks for the network status again when ending is refused for the network', () => {
  render(<ActiveUsageSessionsBanner onShowMySessions={vi.fn()} />);
  state.onError?.({ body: { message: 'NETWORK_RESTRICTED' } });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['network-status'] });
});
