import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SsoProviderType } from '@attraccess/react-query-client';
import { UserManagementDetailsPage } from './index';
const state = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  me: 1,
  manageCards: false,
  roles: [] as { id: number; rolePermissions?: { permissionKey: string }[] }[],
  permissions: [] as {
    key: string;
    label: string;
    description: string;
    category?: string;
    pluginName?: string;
    categoryLabel?: string;
  }[],
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
  useGetOneUserById: () => ({ data: state.user }),
  useGetLicenseInformation: () => ({ data: { modules: ['sso', 'attractap'] } }),
  useGetAllSsoProviders: () => ({ data: state.providers }),
  useListRoles: () => ({ data: state.roles, isLoading: state.loading }),
  useListPermissions: () => ({ data: state.permissions }),
  useGetUserRoleAssignments: () => ({ data: state.assignments }),
  useDeleteUser: (_mutationKey: unknown, options: typeof state.options) => {
    state.options = options;
    return { mutate: state.remove, isPending: false };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  }))()),
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: state.me }, hasPermission: () => state.manageCards }),
}));
vi.mock('../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    permissionLabel: (p: { label: string }) => p.label,
    permissionDescription: (p: { description: string }) => p.description,
    permissionCategory: (category: string, p?: { categoryLabel?: string }) => p?.categoryLabel ?? category,
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
    manageCards: false,
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
it('lists plugin categories by their label after the core categories', () => {
  state.roles = [
    { id: 1, rolePermissions: [{ permissionKey: 'matter.devices.read' }, { permissionKey: 'resources.read' }] },
  ];
  state.assignments = [{ roleId: 1 }];
  state.permissions = [
    {
      key: 'matter.devices.read',
      label: 'View Matter devices',
      description: '',
      category: 'plugin:matter',
      pluginName: 'matter',
      categoryLabel: 'Matter & Thread',
    },
    { key: 'resources.read', label: 'Read resources', description: '', category: 'resources' },
  ];
  show();
  expect(screen.queryByText('plugin:matter')).toBeNull();
  const headings = screen.getAllByText(/^(resources|Matter & Thread)$/).map((node) => node.textContent);
  expect(headings).toEqual(['resources', 'Matter & Thread']);
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
      { providerId: 1, providerType: SsoProviderType.OIDC, ssoSubject: 'subject-1' },
      { providerId: 2, providerType: SsoProviderType.SAML, ssoSubject: 'subject-2' },
      { providerId: 99, providerType: SsoProviderType.OIDC },
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
  expect(state.remove).toHaveBeenCalledWith({ path: { id: 7 } });
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

it('shows the RFID management action only with the dedicated permission', () => {
  const view = show();
  expect(screen.queryByRole('button', { name: 'rfidCards.manage' })).toBeNull();
  view.unmount();
  state.manageCards = true;
  show();
  fireEvent.click(screen.getByRole('button', { name: 'rfidCards.manage' }));
  expect(screen.getByText('/users/7/rfid-cards')).toBeInTheDocument();
});

it('shows the external ID subtitle only when the user has one', () => {
  const view = show();
  expect(screen.queryByText('details.externalIdentifier')).toBeNull();
  view.unmount();
  state.user = { ...state.user, externalIdentifier: 'EXT-1' };
  show();
  expect(screen.getByText('details.externalIdentifier')).toBeInTheDocument();
});
