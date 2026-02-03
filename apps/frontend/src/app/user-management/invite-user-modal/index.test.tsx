import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteUserModal } from './index';
import { TestWrapper } from '../../../test-utils/wrappers';

const mutateMock = vi.fn();

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Invite User',
      'tabs.single': 'Single',
      'tabs.csv': 'CSV import',
      'actions.invite': 'Invite',
      'inputs.username.label': 'Username',
      'inputs.email.label': 'Email',
      'inputs.username.description': '3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.',
      'inputs.username.validation.length': 'Username must be between 3 and 32 characters.',
      'inputs.username.validation.format': 'Only letters, numbers, underscores, hyphens, and dots are allowed.',
      'success.title': 'Success',
      'success.description': 'The user was successfully invited.',
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
  useUsersServiceInviteUser: (options?: { onSuccess?: () => void }) => ({
    mutate: (payload: unknown) => {
      mutateMock(payload);
      options?.onSuccess?.();
    },
    isPending: false,
  }),
  useUsersServiceFindManyKey: 'useUsersServiceFindManyKey',
  ApiError: class ApiError extends Error {},
}));

function renderModal() {
  return render(
    <InviteUserModal>{(onOpen) => <button onClick={onOpen}>Open</button>}</InviteUserModal>,
    { wrapper: TestWrapper },
  );
}

describe('InviteUserModal', () => {
  beforeEach(() => {
    mutateMock.mockReset();
  });

  it('shows username guidance text', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Open'));

    expect(
      screen.getByText('3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.'),
    ).toBeInTheDocument();
  });

  it('blocks invalid usernames and surfaces validation message', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByText('Open'));

    await user.type(screen.getByLabelText('Username'), 'john+qa');
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');

    expect(screen.getByText('Only letters, numbers, underscores, hyphens, and dots are allowed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Invite' }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('submits trimmed, valid data', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByText('Open'));

    const usernameInput = screen.getByLabelText('Username');
    const emailInput = screen.getByLabelText('Email');

    await user.type(usernameInput, 'Jane_Doe');
    await user.type(emailInput, 'test@example.com');

    await user.click(screen.getByRole('button', { name: 'Invite' }));

    expect(mutateMock).toHaveBeenCalledWith({
      requestBody: {
        username: 'Jane_Doe',
        email: 'test@example.com',
      },
    });
  });

  it('clears inputs after a successful invite', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByText('Open'));

    await user.type(screen.getByLabelText('Username'), 'Jane_Doe');
    await user.type(screen.getByLabelText('Email'), 'test@example.com');

    await user.click(screen.getByRole('button', { name: 'Invite' }));

    await user.click(screen.getByText('Open'));

    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });
});
