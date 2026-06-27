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
  { id: 1, key: 'resource-manager', label: 'Resource Manager' },
  { id: 2, key: 'system-admin', label: 'System Admin' },
  { id: 3, key: 'user-manager', label: 'User Manager' },
  { id: 4, key: 'billing-manager', label: 'Billing Manager' },
];

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Permissions',
      'permissions.resource-manager': 'Manage resources',
      'permissions.system-admin': 'Manage system configuration',
      'permissions.user-manager': 'Manage users',
      'permissions.billing-manager': 'Manage billing',
      'actions.save': 'Save',
      'messages.updated': 'Permissions updated',
      'ssoManaged.title': 'Managed by SSO',
      'ssoManaged.description':
        'Permissions are managed by {{providers}} and cannot be edited here. Update the SSO permission mappings to change them.',
      'ssoManaged.providerFallback': 'the SSO provider',
    };

    const t = (key: string, vars?: Record<string, unknown>) => {
      let value = translations[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([varKey, varValue]) => {
          value = value.replace(`{{${varKey}}}`, String(varValue));
        });
      }
      return value;
    };

    const tExists = (key: string) => Boolean(translations[key]);
    return { t, tExists };
  },
}));

vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: ROLES, isLoading: false }),
  useUsersServiceGetUserRoleAssignments: () => ({
    data: [{ roleId: 1 }, { roleId: 3 }], // resource-manager and user-manager assigned
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

    await waitFor(() => expect(screen.getByLabelText('Manage resources')).toBeChecked());
    expect(screen.getByLabelText('Manage users')).toBeChecked();
    expect(screen.getByLabelText('Manage system configuration')).not.toBeChecked();
    expect(screen.getByLabelText('Manage billing')).not.toBeChecked();
  });

  it('calls assignRole and revokeRole on save', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    // Toggle: uncheck resource-manager (id=1), check billing-manager (id=4)
    await waitFor(() => expect(screen.getByLabelText('Manage resources')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('Manage resources'));
    await userEvent.click(screen.getByLabelText('Manage billing'));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(assignRoleMock).toHaveBeenCalledWith({ id: user.id, requestBody: { roleId: 4 } });
      expect(revokeRoleMock).toHaveBeenCalledWith({ id: user.id, roleId: 1 });
    });
  });
});
