import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SSOProviderType } from '@attraccess/react-query-client';
import { UserManagementDetailsPage } from './index';
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  me: 1,
  roles: [] as { id: number; rolePermissions?: { permissionKey: string }[] }[],
  permissions: [] as { key: string; label: string; description: string; category?: string }[],
  assignments: [] as { roleId: number }[],
  providers: [] as Record<string, unknown>[],
  loading: false,
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (e: unknown) => void },
  permissionProps: {} as {
    ssoManagedProviders: string[];
    ssoManagedPermissionKeys: Set<string>;
    roleIdToAssign?: number;
  },
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUsersServiceGetOneUserById: () => ({ data: state.user }),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: ['sso'] } }),
  useAuthenticationServiceGetAllSsoProviders: () => ({ data: state.providers }),
  useRbacServiceListRoles: () => ({ data: state.roles, isLoading: state.loading }),
  useRbacServiceListPermissions: () => ({ data: state.permissions }),
  useUsersServiceGetUserRoleAssignments: () => ({ data: state.assignments }),
  useUsersServiceDeleteUser: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.remove, isPending: false };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: state.me } }) }));
vi.mock('../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    permissionLabel: (p: { label: string }) => p.label,
    permissionDescription: (p: { description: string }) => p.description,
    permissionCategory: (category: string) => category,
  }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('./components/permissionsForm', () => ({
  UserPermissionForm: (props: typeof state.permissionProps) => {
    state.permissionProps = props;
    return <div>Permission editor</div>;
  },
}));
vi.mock('./components/setPasswordForm', () => ({ SetPasswordForm: () => <div>Password editor</div> }));
vi.mock('./components/changeUsername', () => ({ ChangeUsernameForm: () => <div>Username editor</div> }));
vi.mock('./components/changeEmail', () => ({ ChangeEmailForm: () => <div>Email editor</div> }));
vi.mock('../../not-found', () => ({ NotFound: () => <div>Not found</div> }));
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function show(path = '/users/7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/users/:id" element={<UserManagementDetailsPage />} />
        <Route path="/users" element={<div>User list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    user: { id: 7, username: 'Ada', authenticationDetails: [] },
    me: 1,
    roles: [],
    permissions: [],
    assignments: [],
    providers: [],
    loading: false,
  });
});
afterEach(cleanup);
it('rejects non-numeric routes and renders a pending user safely', () => {
  const view = show('/users/security');
  expect(screen.getByText('Not found')).toBeTruthy();
  view.unmount();
  state.user = undefined;
  show();
  expect(screen.queryByText('Permission editor')).toBeNull();
});
it('combines assigned roles without exposing unassigned permissions, grouped by category', () => {
  state.roles = [
    { id: 1, rolePermissions: [{ permissionKey: 'read' }, { permissionKey: 'write' }] },
    { id: 2, rolePermissions: [{ permissionKey: 'read' }] },
    { id: 3, rolePermissions: [{ permissionKey: 'secret' }] },
  ];
  state.assignments = [{ roleId: 1 }, { roleId: 2 }];
  state.permissions = [
    { key: 'read', label: 'Read tools', description: 'Read description', category: 'Resources' },
    { key: 'write', label: 'Write tools', description: 'Write description' },
    { key: 'secret', label: 'Secret admin', description: 'Hidden' },
  ];
  show('/users/7?assignRoleId=3');
  expect(screen.getAllByText('Read tools')).toHaveLength(1);
  expect(screen.getByTitle('Write description')).toHaveTextContent('Write tools');
  expect(screen.getByText('effectivePermissions.uncategorized')).toBeTruthy();
  expect(screen.queryByText('Secret admin')).toBeNull();
  expect(state.permissionProps.roleIdToAssign).toBe(3);
});
it('shows loading and empty permissions and prevents self deletion', () => {
  state.loading = true;
  const view = show();
  expect(screen.getByText('effectivePermissions.loading')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.me = 7;
  show();
  expect(screen.getByText('effectivePermissions.empty')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'delete.actions.open' })).toBeDisabled();
  expect(screen.getByText('sso.notLinkedHint')).toBeTruthy();
});
it('summarizes linked OIDC and SAML permission mappings, tolerating missing providers and incomplete identities', () => {
  state.providers = [
    { id: 1, name: 'Corporate', oidcConfiguration: { roleMappings: { read: ['staff'], ignored: [] } } },
    { id: 2, samlConfiguration: { roleMappings: { write: ['editor'] } } },
  ];
  state.user = {
    id: 7,
    username: 'Ada',
    authenticationDetails: [
      { providerId: 1, providerType: SSOProviderType.OIDC, ssoSubject: 'subject-1' },
      { providerId: 2, providerType: SSOProviderType.SAML, ssoSubject: 'subject-2' },
      { providerId: 99, providerType: SSOProviderType.OIDC },
      { ssoSubject: 'orphan' },
      { providerId: 1 },
      { type: 'password' },
    ],
  };
  show();
  expect(screen.getAllByText('Corporate')).toHaveLength(2);
  expect(screen.getByText('OIDC #99')).toBeTruthy();
  expect(screen.getByText('orphan')).toBeTruthy();
  expect(state.permissionProps.ssoManagedProviders).toEqual(['Corporate', 'SAML #2']);
  expect([...state.permissionProps.ssoManagedPermissionKeys]).toEqual(['read', 'write']);
});
it('confirms deletion and returns to the list after success', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'delete.actions.open' }));
  fireEvent.click(await screen.findByRole('button', { name: 'delete.actions.confirm' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 7 });
  act(() => state.options.onSuccess());
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'delete.success.title' }));
  expect(screen.getByText('User list')).toBeTruthy();
});
it('reports deletion failures and lets the administrator cancel', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'delete.actions.open' }));
  const error = new Error('Denied');
  act(() => state.options.onError(error));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'apiErrors' }));
  fireEvent.click(await screen.findByRole('button', { name: 'delete.actions.cancel' }));
  expect(state.remove).not.toHaveBeenCalled();
});
