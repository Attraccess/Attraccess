import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserPermissionForm } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';
import type { User } from '@attraccess/react-query-client';

const assignRoleMock = vi.fn().mockResolvedValue(undefined);
const revokeRoleMock = vi.fn().mockResolvedValue(undefined);

const ROLES = [
  { id: 1, key: 'resource-manager', name: 'Resource Manager', rolePermissions: [] },
  { id: 2, key: 'system-admin', name: 'System Admin', rolePermissions: [] },
  { id: 3, key: 'user-manager', name: 'User Manager', rolePermissions: [] },
  { id: 4, key: 'billing-manager', name: 'Billing Manager', rolePermissions: [] },
  { id: 5, key: 'administrator', name: 'Administrator', rolePermissions: [] },
  { id: 6, key: 'user', name: 'User', rolePermissions: [] },
  { id: 7, key: 'my-custom-role', name: 'My Custom Role', rolePermissions: [] },
];

// Stable reference — must not be inline in the mock factory; a new array on every hook
// call makes userRoles change reference each render and causes an infinite useEffect loop.
const USER_ROLE_ASSIGNMENTS_MANUAL = [
  { roleId: 1, source: 'manual', role: ROLES[0] },
  { roleId: 3, source: 'manual', role: ROLES[2] },
];

const USER_ROLE_ASSIGNMENTS_WITH_SSO = [
  { roleId: 1, source: 'manual', role: ROLES[0] },
  { roleId: 2, source: 'sso', ssoProviderId: 10, ssoProviderType: 'oidc', externalValue: 'admins', role: ROLES[1] },
  // administrator via SSO — not in manageable list
  { roleId: 5, source: 'sso', ssoProviderId: 10, ssoProviderType: 'oidc', externalValue: 'administrators', role: ROLES[4] },
];

let currentUserRoles: typeof USER_ROLE_ASSIGNMENTS_MANUAL | typeof USER_ROLE_ASSIGNMENTS_WITH_SSO =
  USER_ROLE_ASSIGNMENTS_MANUAL;

// Translations are NOT mocked: the component's labels come from the real RBAC catalog
// via useRbacCatalogTranslations, so the fixture names above (e.g. 'System Admin') must
// not appear in the output — the catalog name ('System Administrator') must.

vi.mock('../../../../../components/labeledSwitch', () => ({
  LabeledSwitch: ({ children, isSelected, isDisabled, onChange, ...props }: Record<string, unknown>) => (
    <label {...props}>
      <input
        type="checkbox"
        checked={Boolean(isSelected)}
        disabled={Boolean(isDisabled)}
        onChange={(e) => (onChange as (value: boolean) => void)?.(e.target.checked)}
      />
      {children as React.ReactNode}
    </label>
  ),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: ROLES, isLoading: false }),
  useUsersServiceGetUserRoleAssignments: () => ({
    data: currentUserRoles,
    isLoading: false,
  }),
  useUsersServiceAssignRoleToUser: () => ({ mutateAsync: assignRoleMock, isPending: false }),
  useUsersServiceRevokeRoleFromUser: () => ({ mutateAsync: revokeRoleMock, isPending: false }),
  useUsersServiceGetUserRoleAssignmentsKey: 'useUsersServiceGetUserRoleAssignmentsKey',
  ApiError: class ApiError extends Error {},
}));

describe('UserPermissionForm', () => {
  beforeEach(() => {
    assignRoleMock.mockClear();
    revokeRoleMock.mockClear();
    currentUserRoles = USER_ROLE_ASSIGNMENTS_MANUAL;
  });

  it('disables role editing when managed by SSO', async () => {
    const user = { id: 1 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={['Okta']} />, { wrapper: TestWrapper });

    expect(screen.getByText('Managed by SSO')).toBeInTheDocument();
    expect(screen.getByText(/Okta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows current role assignments as checked', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    await waitFor(() => expect(screen.getByLabelText('Resource Manager')).toBeChecked());
    expect(screen.getByLabelText('User Manager')).toBeChecked();
    // Catalog name, not the fixture's 'System Admin'
    expect(screen.getByLabelText('System Administrator')).not.toBeChecked();
    expect(screen.queryByLabelText('System Admin')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Billing Manager')).not.toBeChecked();
  });

  it('calls assignRole and revokeRole on save', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    // Toggle: uncheck resource-manager (id=1), check billing-manager (id=4)
    await waitFor(() => expect(screen.getByLabelText('Resource Manager')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('Resource Manager'));
    await userEvent.click(screen.getByLabelText('Billing Manager'));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(assignRoleMock).toHaveBeenCalledWith({ id: user.id, requestBody: { roleId: 4 } });
      expect(revokeRoleMock).toHaveBeenCalledWith({ id: user.id, roleId: 1 });
    });
  });

  it('shows SSO badge with external value for SSO-assigned manageable roles', async () => {
    currentUserRoles = USER_ROLE_ASSIGNMENTS_WITH_SSO;
    const user = { id: 5 } as User;
    render(
      <UserPermissionForm
        user={user}
        ssoManagedProviders={['MyOIDC']}
        ssoManagedPermissionKeys={new Set(['system-admin'])}
      />,
      {
        wrapper: TestWrapper,
      },
    );

    // system-admin is SSO-managed: should show the badge
    await waitFor(() => expect(screen.getByText(/Via SSO: #10 · admins/)).toBeInTheDocument());
  });

  it('shows SSO-only roles section for non-manageable SSO roles', async () => {
    currentUserRoles = USER_ROLE_ASSIGNMENTS_WITH_SSO;
    const user = { id: 5 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={['MyOIDC']} />, { wrapper: TestWrapper });

    await waitFor(() =>
      expect(screen.getByTestId !== undefined ? screen.getByText('SSO-managed roles') : true).toBeTruthy(),
    );

    // Administrator role should appear in the SSO-only section
    await waitFor(() => expect(screen.getByText('Administrator')).toBeInTheDocument());
  });

  it('disables toggle for SSO-managed role keys', async () => {
    currentUserRoles = USER_ROLE_ASSIGNMENTS_WITH_SSO;
    const user = { id: 5 } as User;
    render(
      <UserPermissionForm
        user={user}
        ssoManagedProviders={['MyOIDC']}
        ssoManagedPermissionKeys={new Set(['system-admin'])}
      />,
      { wrapper: TestWrapper },
    );

    await waitFor(() => {
      const systemAdminCheckbox = screen.getByLabelText('System Administrator');
      expect(systemAdminCheckbox).toBeDisabled();
    });
  });

  it('excludes the user role from the manageable list', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    await waitFor(() => expect(screen.getByLabelText('Resource Manager')).toBeInTheDocument());
    // 'user' is in NON_MANAGEABLE_ROLE_KEYS — no toggle should be rendered for it
    expect(screen.queryByLabelText('User')).not.toBeInTheDocument();
  });

  it('shows a custom role using role.name as label when no translation key exists', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    // Custom role has no translation entry — must fall back to role.name
    await waitFor(() => expect(screen.getByLabelText('My Custom Role')).toBeInTheDocument());
  });
});
