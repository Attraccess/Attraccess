import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UserManagementPage } from './index';
const state = vi.hoisted(() => ({ query: vi.fn(), rows: [] as unknown[], total: 0 }));
const roles = [
  { id: 2, key: 'operator', name: 'Operators' },
  { id: 3, key: 'admin', name: 'Admins' },
];
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDebounce: (value: unknown) => value,
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
}));
vi.mock('../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({ roleName: (role: { name: string }) => role.name }),
}));
vi.mock('./invite-user-modal', () => ({
  InviteUserModal: ({ children }: { children: (open: () => void) => ReactNode }) => children(() => undefined),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: roles }),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: ['sso'] } }),
  useAuthenticationServiceGetAllSsoProviders: () => ({ data: [{ id: 8, name: 'Organization login' }] }),
  useUsersServiceFindMany: (query: unknown) => {
    state.query(query);
    return { data: { data: state.rows, total: state.total }, isFetched: true };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.total = 0;
});
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function mount(search = '') {
  return render(
    <MemoryRouter initialEntries={['/users' + search]}>
      <UserManagementPage />
      <Location />
    </MemoryRouter>,
  );
}
it('restores role, email and SSO filters from the URL and removes only the selected category', () => {
  mount('?q=alex&roleId=2&roleId=invalid&roleMatch=all&emailVerified=false&ssoProviderId=8');
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: 'alex',
      roleIds: [2],
      roleMatch: 'all',
      emailVerified: false,
      ssoProviderIds: [8],
      includeRoles: true,
    }),
  );
  const group = screen.getByRole('group', { name: 'filters.role' });
  fireEvent.click(within(group).getByRole('button', { name: 'filters.remove' }));
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ roleIds: [], roleMatch: 'any', emailVerified: false, ssoProviderIds: [8] }),
  );
  expect(screen.getByTestId('location').textContent).not.toContain('roleId');
});
it('preserves exclusion filters and resets pagination when the search changes', () => {
  state.total = 21;
  mount('?excludeRoleId=3&roleOperator=none&excludeSsoProviderId=8&ssoProviderOperator=none&hasSsoProvider=true');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2, excludeRoleIds: [3], excludeSsoProviderIds: [8], hasSsoProvider: true }),
  );
  fireEvent.change(screen.getByLabelText('table.inputs.search'), { target: { value: 'new search' } });
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, search: 'new search', excludeRoleIds: [3], excludeSsoProviderIds: [8] }),
  );
});
it('renders elevated roles once, omits default roles, and supports user navigation', () => {
  state.rows = [
    {
      id: 7,
      username: 'alex',
      isEmailVerified: true,
      externalIdentifier: 'staff-7',
      userRoles: [{ role: roles[1] }, { role: roles[1] }, { role: { id: 1, key: 'user', name: 'User' } }],
      authenticationDetails: [
        { providerId: 8, providerType: 'OIDC', ssoSubject: 'abc' },
        { providerId: 99, providerType: 'SAML' },
      ],
    },
  ];
  state.total = 1;
  const { container } = mount('?assignRoleId=3');
  expect(container.querySelectorAll('[data-cy="user-role-chip-admin"]')).toHaveLength(1);
  expect(container.querySelector('[data-cy="user-role-chip-user"]')).toBeNull();
  const row = screen.getByRole('row', { name: /alex/ });
  row.focus();
  fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
  fireEvent.keyUp(row, { key: 'Enter', code: 'Enter' });
  expect(screen.getByTestId('location').textContent).toBe('/users/7?assignRoleId=3');
});
it('starts assigning a role from an empty filtered list without retaining membership filters', () => {
  mount('?roleId=3&q=nobody');
  fireEvent.click(screen.getByRole('button', { name: 'empty.assignRole' }));
  expect(screen.getByTestId('location').textContent).toBe('/users?assignRoleId=3');
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ roleIds: [], search: '' }));
});
it('opens the mobile role chooser and applies selected memberships to the URL', async () => {
  const { container } = mount('?filter=role');
  const trigger = container.querySelector('[data-cy="user-management-role-filter-drawer-trigger"]');
  if (!trigger) throw new Error('Missing mobile filter trigger');
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('option', { name: 'Operators' }));
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ roleIds: [2] }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'filters.done' }));
  expect(screen.getByTestId('location').textContent).toContain('roleId=2');
});
it('switches role matching from inclusion to exclusion without losing selected roles', async () => {
  mount('?roleId=2&roleId=3');
  fireEvent.click(screen.getByRole('button', { name: /filters.roleMatch/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'filters.isNoneOf' }));
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ roleIds: [], excludeRoleIds: [2, 3] }));
  fireEvent.click(screen.getByRole('button', { name: /filters.roleMatch/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'filters.isAllOf' }));
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ roleIds: [2, 3], excludeRoleIds: [], roleMatch: 'all' }),
  );
});
it('treats excluding users without SSO as requiring an SSO provider', async () => {
  const { container } = mount('?filter=ssoProvider');
  const trigger = container.querySelector('[data-cy="user-management-sso-provider-filter-drawer-trigger"]');
  if (!trigger) throw new Error('Missing mobile SSO filter trigger');
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('option', { name: 'filters.none' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'filters.done' }));
  expect(state.query).toHaveBeenLastCalledWith(expect.objectContaining({ ssoProviderNone: true }));
  fireEvent.click(screen.getByRole('button', { name: /filters.ssoProviderMatch/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'filters.isNoneOf' }));
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ ssoProviderNone: undefined, hasSsoProvider: true }),
  );
});
