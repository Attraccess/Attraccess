import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceGroupCard } from './index';
const state = vi.hoisted(() => ({
  resources: [] as { id: number; name: string }[],
  total: 0,
  fetched: true,
  status: 'success',
  manage: false,
  introducer: false,
  navigate: vi.fn(),
  query: vi.fn(),
  groupQuery: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDebounce: (value: unknown) => value,
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.manage, user: { id: 7 } }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceGroupsGetOne: (...args: unknown[]) => {
    state.groupQuery(...args);
    return { data: { name: ' Workshop ', description: ' Shared tools ' }, status: state.status };
  },
  useResourcesServiceGetAllResources: (args: unknown) => {
    state.query(args);
    return { data: { data: state.resources, total: state.total }, status: state.status, isFetched: state.fetched };
  },
  useAccessControlServiceResourceGroupIntroducersIsIntroducer: () => ({ data: { isIntroducer: state.introducer } }),
}));
vi.mock('../../../components/ResourceListItem', () => ({
  ResourceListItem: ({ resource, onPress }: { resource: { name: string }; onPress: () => void }) => (
    <button onClick={onPress}>{resource.name}</button>
  ),
}));
vi.mock('../../../components/emptyState', () => ({ EmptyState: () => <p>No resources</p> }));
beforeEach(() => {
  vi.clearAllMocks();
  state.resources = [];
  state.total = 0;
  state.fetched = true;
  state.status = 'success';
  state.manage = false;
  state.introducer = false;
});
afterEach(cleanup);
it('hides an empty group only after fetching, and otherwise explains the empty state', () => {
  const view = render(<ResourceGroupCard groupId={3} hideIfEmpty />);
  expect(view.container.textContent).toBe('');
  view.rerender(<ResourceGroupCard groupId={3} hideIfEmpty={false} />);
  expect(screen.getByText('Workshop')).toBeTruthy();
  expect(screen.getByText('Shared tools')).toBeTruthy();
  expect(screen.getByText('No resources')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'actions.openGroupSettings' })).toBeNull();
});
it('passes filters and pagination to the query and opens a selected resource', () => {
  state.resources = [{ id: 9, name: 'Laser cutter' }];
  state.total = 21;
  render(
    <ResourceGroupCard
      groupId={3}
      hideIfEmpty
      filter={{ search: ' laser ', onlyInUseByMe: true, onlyWithPermissions: true }}
    />,
  );
  expect(state.query).toHaveBeenLastCalledWith({
    groupId: 3,
    search: 'laser',
    onlyInUseByMe: true,
    onlyWithPermissions: true,
    page: 1,
    limit: 10,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Laser cutter' }));
  expect(state.navigate).toHaveBeenCalledWith('/resources/9');
  const next = screen.getByRole('button', { name: /next/i });
  fireEvent.click(next);
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
});
it('allows group introducers to open settings while keeping ungrouped resources separate', () => {
  state.introducer = true;
  const view = render(<ResourceGroupCard groupId={3} hideIfEmpty={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.openGroupSettings' }));
  expect(state.navigate).toHaveBeenCalledWith('/resource-groups/3');
  view.rerender(<ResourceGroupCard groupId="none" hideIfEmpty={false} />);
  expect(screen.getByText('ungrouped')).toBeTruthy();
  expect(state.groupQuery).toHaveBeenLastCalledWith({ id: 'none' }, undefined, { enabled: false });
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: -1 }));
  expect(screen.queryByRole('button', { name: 'actions.openGroupSettings' })).toBeNull();
});
