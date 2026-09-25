import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from './registrationForm';
import { TestWrapper } from '../../test-utils/wrappers';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';

const mutateMock = vi.fn();
const onHasAccountMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));
const labels = { en, de };

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: (locales: Record<string, Record<string, unknown>>) => {
    const translations = locales[locale.current];
    const lookup = (key: string) => key.split('.').reduce<unknown>(
      (value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
      translations,
    );
    const t = (key: string, vars?: Record<string, unknown>) => {
      const value = lookup(key);
      if (typeof value !== 'string') return key;
      return Object.entries(vars ?? {}).reduce(
        (result, [name, replacement]) => result.replaceAll(`{{${name}}}`, String(replacement)),
        value,
      );
    };
    const tExists = (key: string) => lookup(key) !== undefined;
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

    expect(screen.getByText(labels.de.hasAccount)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.username)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.email)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.password)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.passwordConfirmation)).toBeInTheDocument();
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
