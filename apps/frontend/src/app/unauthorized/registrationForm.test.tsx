import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from './registrationForm';
import { TestWrapper } from '../../test-utils/wrappers';

const mutateMock = vi.fn();
const onHasAccountMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = locale.current === 'de' ? {
      title: 'Bereit zum Gestalten?',
      hasAccount: 'Hast du bereits ein Konto?',
      signInButton: 'Anmelden',
      username: 'Benutzername',
      usernameDescription: '3-32 Zeichen.',
      'usernameValidation.length': 'Ungültige Länge.',
      'usernameValidation.format': 'Ungültiges Format.',
      email: 'E-Mail-Adresse',
      password: 'Passwort',
      passwordConfirmation: 'Bestätige dein Passwort',
      createAccountButton: 'Konto erstellen',
      creatingAccount: 'Dein Konto wird erstellt...',
      generatePassword: 'Starkes Passwort generieren',
      'validationError.passwordsDoNotMatch': 'Die Passwörter stimmen nicht überein',
      'success.title': 'Konto erfolgreich erstellt!',
      'success.message': 'Aktivierungs-E-Mail an {email} gesendet.',
      'success.closeButton': 'Verstanden',
    } : {
      title: 'Ready to create?',
      hasAccount: 'Already have an account?',
      signInButton: 'Sign in',
      username: 'Username',
      usernameDescription: '3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.',
      'usernameValidation.length': 'Username must be between 3 and 32 characters.',
      'usernameValidation.format': 'Only letters, numbers, underscores, hyphens, and dots are allowed.',
      email: 'Email address',
      password: 'Password',
      passwordConfirmation: 'Confirm your password',
      createAccountButton: 'Create account',
      creatingAccount: 'Creating your account...',
      generatePassword: 'Generate strong password',
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
  usePasswordPolicyServiceGetPublicPasswordPolicy: () => ({
    data: {
      minLength: 12,
      maxLength: 128,
      allowAllUnicode: true,
      requireUppercase: false,
      requireLowercase: false,
      requireDigit: false,
      requireSpecial: false,
      minZxcvbnScore: 3,
    },
  }),
  useUsersServiceFindManyKey: 'useUsersServiceFindManyKey',
  UseUsersServiceFindManyKeyFn: () => ['useUsersServiceFindManyKey'],
  ApiError: class ApiError extends Error {},
  AuthenticationType: { LOCAL_PASSWORD: 'LOCAL_PASSWORD' },
}));

vi.mock('../../components/PasswordPolicyHints', () => ({
  PasswordPolicyHints: () => <div data-testid="policy-hints" />,
  generateStrongPassword: () => 'GeneratedStrong-12345!',
}));

function renderForm() {
  return render(<RegistrationForm onHasAccount={onHasAccountMock} />, { wrapper: TestWrapper });
}

describe('RegistrationForm', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    onHasAccountMock.mockReset();
    locale.current = 'en';
  });

  it('shows username guidance text', async () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(
      screen.getByText('3-32 characters. Allowed: letters, numbers, underscores, hyphens, and dots.'),
    ).toBeInTheDocument();
  });

  it('renders descriptive German navigation, field, and submit labels', () => {
    locale.current = 'de';
    renderForm();

    expect(screen.getByText('Hast du bereits ein Konto?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument();
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeInTheDocument();
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
    expect(screen.getByLabelText('Bestätige dein Passwort')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konto erstellen' })).toBeInTheDocument();
  });

  it('blocks invalid usernames and surfaces validation message', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Username'), 'john+qa');
    await user.type(screen.getByLabelText('Email address'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple-42');
    await user.type(screen.getByLabelText('Confirm your password'), 'correct-horse-battery-staple-42');

    expect(screen.getByText('Only letters, numbers, underscores, hyphens, and dots are allowed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('submits trimmed, valid data', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Username'), '  Jane_Doe  ');
    await user.type(screen.getByLabelText('Email address'), ' test@example.com ');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple-42');
    await user.type(screen.getByLabelText('Confirm your password'), 'correct-horse-battery-staple-42');

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(mutateMock).toHaveBeenCalledWith({
      requestBody: {
        username: 'Jane_Doe',
        password: 'correct-horse-battery-staple-42',
        email: 'test@example.com',
        strategy: 'LOCAL_PASSWORD',
      },
    });
  });
});
