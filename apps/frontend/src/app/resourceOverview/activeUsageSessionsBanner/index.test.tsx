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
  invalidate: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  onSuccess: undefined as undefined | ((data: { resourceId: number }) => void),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: state.success }) }));
vi.mock('../../../utils/apiError', () => ({
  getTranslationKeyForApiError: () => ({ key: 'api.denied', errorMessage: 'Denied' }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceGetAllResourcesKey: 'resources',
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: ({ resourceId }: { resourceId: number }) => [
    'active',
    resourceId,
  ],
  useResourcesServiceGetAllResources: ({ limit }: { limit: number }) =>
    limit === 1
      ? { data: { total: state.total }, isLoading: state.loading, refetch: state.refetch }
      : { data: { data: state.resources }, isLoading: state.listLoading },
  useResourcesServiceResourceUsageEndSession: ({ onSuccess }: { onSuccess: typeof state.onSuccess }) => {
    state.onSuccess = onSuccess;
    return { mutateAsync: state.end };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.total = 2;
  state.loading = false;
  state.listLoading = false;
  state.resources = [
    { id: 1, name: 'Lathe' },
    { id: 2, name: 'Saw' },
  ];
  state.end.mockImplementation(async ({ resourceId }: { resourceId: number }) => {
    state.onSuccess?.({ resourceId });
  });
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
  expect(state.end).toHaveBeenCalledWith({ resourceId: 1, requestBody: {} });
  expect(state.end).toHaveBeenCalledWith({ resourceId: 2, requestBody: {} });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['active', 1] });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(state.success).toHaveBeenCalledWith({ title: 'endedAll.success' });
});
it('keeps partial failures visible alongside successful resources', async () => {
  state.end.mockImplementation(async ({ resourceId }: { resourceId: number }) => {
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
