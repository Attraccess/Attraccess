import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserPermissionForm } from './index';
import { TestWrapper } from '../../../../../test-utils/wrappers';
import type { User } from '@attraccess/react-query-client';

const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
const permissionsFixture = {
  canManageResources: true,
  canManageSystemConfiguration: false,
  canManageUsers: true,
  canManageBilling: false,
};

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Permissions',
      'permissions.canManageResources': 'Manage resources',
      'permissions.canManageSystemConfiguration': 'Manage system configuration',
      'permissions.canManageUsers': 'Manage users',
      'permissions.canManageBilling': 'Manage billing',
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
  useUsersServiceGetPermissions: () => ({
    data: permissionsFixture,
    isLoading: false,
  }),
  useUsersServiceUpdatePermissions: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
  UseUsersServiceFindManyKeyFn: () => ['users'],
  ApiError: class ApiError extends Error {},
}));

describe('UserPermissionForm', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
  });

  it('disables permission editing when managed by SSO', async () => {
    const user = { id: 1 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={['Okta']} />, { wrapper: TestWrapper });

    expect(screen.getByText('Managed by SSO')).toBeInTheDocument();
    expect(screen.getByText(/Okta/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Manage resources')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('submits permission updates when not SSO-managed', async () => {
    const user = { id: 7 } as User;
    render(<UserPermissionForm user={user} ssoManagedProviders={[]} />, { wrapper: TestWrapper });

    await waitFor(() => expect(screen.getByLabelText('Manage resources')).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      id: user.id,
      requestBody: permissionsFixture,
    });
  });
});
