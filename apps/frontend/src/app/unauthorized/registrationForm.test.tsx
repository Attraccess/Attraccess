import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from './registrationForm';
import { TestWrapper } from '../../test-utils/wrappers';

const mutateMock = vi.fn();
const onHasAccountMock = vi.fn();

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Ready to create?',
      hasAccount: 'Already using our machines?',
      signInButton: 'Sign in here',
      username: 'Pick a username',
      usernameDescription: '3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.',
      'usernameValidation.length': 'Username must be between 3 and 32 characters.',
      'usernameValidation.format': 'Only letters, numbers, underscores, hyphens, and dots are allowed.',
      email: 'Your email address',
      password: 'Create your password',
      passwordConfirmation: 'Confirm your password',
      createAccountButton: 'Create account and start making!',
      creatingAccount: 'Creating your account...',
      'validationError.passwordTooShort': 'Password must be at least 8 characters long.',
      'validationError.passwordsDoNotMatch': 'The passwords do not match',
      'success.title': 'Account Created Successfully!',
      'success.message':
        'We have sent an activation email to {email}. Please check your inbox and click the activation link to complete your registration.',
      'success.closeButton': 'Got it',
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
  useUsersServiceCreateOneUser: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
  UseUsersServiceFindManyKeyFn: () => ['useUsersServiceFindManyKey'],
  ApiError: class ApiError extends Error {},
  AuthenticationType: { LOCAL_PASSWORD: 'LOCAL_PASSWORD' },
}));

function renderForm() {
  return render(<RegistrationForm onHasAccount={onHasAccountMock} />, { wrapper: TestWrapper });
}

describe('RegistrationForm', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    onHasAccountMock.mockReset();
  });

  it('shows username guidance text', async () => {
    renderForm();

    expect(
      screen.getByText('3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.'),
    ).toBeInTheDocument();
  });

  it('blocks invalid usernames and surfaces validation message', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Pick a username'), 'john+qa');
    await user.type(screen.getByLabelText('Your email address'), 'admin@example.com');
    await user.type(screen.getByLabelText('Create your password'), 'password123');
    await user.type(screen.getByLabelText('Confirm your password'), 'password123');

    expect(screen.getByText('Only letters, numbers, underscores, hyphens, and dots are allowed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account and start making!' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Create account and start making!' }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('submits trimmed, valid data', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Pick a username'), '  Jane_Doe  ');
    await user.type(screen.getByLabelText('Your email address'), ' test@example.com ');
    await user.type(screen.getByLabelText('Create your password'), 'password123');
    await user.type(screen.getByLabelText('Confirm your password'), 'password123');

    await user.click(screen.getByRole('button', { name: 'Create account and start making!' }));

    expect(mutateMock).toHaveBeenCalledWith({
      requestBody: {
        username: 'Jane_Doe',
        password: 'password123',
        email: 'test@example.com',
        strategy: 'LOCAL_PASSWORD',
      },
    });
  });
});
