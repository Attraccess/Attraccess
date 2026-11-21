import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormsListPage } from './FormsListPage';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  query: vi.fn(),
  canUpdate: true,
  forms: [] as unknown[],
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => state.navigate,
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permission === 'resources.update' && state.canUpdate }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useFormsList: (...args: unknown[]) => {
    state.query(...args);
    return { data: { data: state.forms, total: state.forms.length, page: 1, limit: 25 }, isLoading: false };
  },
}));

const listed = (id: number, name: string, scope: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  scope,
  resourceId: null,
  groupId: null,
  resourceName: null,
  groupName: null,
  appliesToResourceCount: 1,
  fields: [{ id: 1 }],
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: true,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.canUpdate = true;
  state.forms = [
    listed(1, 'Everywhere', 'global', { appliesToResourceCount: 12, fields: [{ id: 1 }, { id: 2 }] }),
    listed(2, 'Laser safety', 'group', { groupId: 3, groupName: 'Lasers', appliesToResourceCount: 3 }),
    listed(3, 'Printer feedback', 'resource', { resourceId: 7, resourceName: 'Printer' }),
  ];
});
afterEach(cleanup);

const mount = () =>
  render(
    <MemoryRouter>
      <FormsListPage />
    </MemoryRouter>,
  );

it('lists forms with where they apply, their fields and how many resources they reach', () => {
  mount();
  const table = screen.getByRole('grid', { name: 'Forms' });
  expect(within(table).getByText('Global')).toBeInTheDocument();
  expect(within(table).getByText('Group: Lasers')).toBeInTheDocument();
  expect(within(table).getByText('Resource: Printer')).toBeInTheDocument();
  expect(within(table).getByText('12 resources')).toBeInTheDocument();
  expect(within(table).getByText('2 fields')).toBeInTheDocument();
  expect(state.query).toHaveBeenCalledWith({ query: { page: 1, limit: 25 } });
});

it('filters by scope and opens the editor for new and existing forms', async () => {
  mount();
  await userEvent.click(screen.getByRole('button', { name: /Scope$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Group' }));
  expect(state.query).toHaveBeenLastCalledWith({ query: { page: 1, limit: 25, scope: 'group' } });

  await userEvent.click(screen.getByRole('button', { name: 'Actions for Laser safety' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit form' }));
  expect(state.navigate).toHaveBeenCalledWith('/forms/2');
  await userEvent.click(screen.getByRole('button', { name: 'New form' }));
  expect(state.navigate).toHaveBeenCalledWith('/forms/new');
});

it('sends people without resources.update away', () => {
  state.canUpdate = false;
  mount();
  expect(screen.queryByRole('grid')).toBeNull();
});

it('tells an empty list apart from a filter that matches nothing', async () => {
  state.forms = [];
  mount();
  expect(screen.getByText('No forms yet')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Scope$/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'Global' }));
  expect(screen.getByText('No forms match this filter.')).toBeInTheDocument();
});
