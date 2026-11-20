import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from './registrationForm';
import { TestWrapper } from '../../test-utils/wrappers';
import en from './registrationForm.en.json';
import de from './registrationForm.de.json';

const mutateMock = vi.fn();
const onHasAccountMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));
const pending = vi.hoisted(() => ({ createAccount: false }));
const resend = vi.hoisted(() => ({
  mutate: vi.fn(),
  options: undefined as undefined | { onSuccess?: () => void; onError?: (error: unknown) => void },
}));
const change = vi.hoisted(() => ({
  mutate: vi.fn(),
  options: undefined as undefined | { onSuccess?: () => void; onError?: (error: unknown) => void },
}));
const createAccountOptions = vi.hoisted(() => ({ current: undefined as undefined | { onSuccess?: () => void } }));
const labels = { en, de };

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: (locales: Record<string, Record<string, unknown>>) => {
      const translations = locales[locale.current];
      const lookup = (key: string) =>
        key
          .split('.')
          .reduce<unknown>(
            (value, part) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
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
  }))()),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useResendVerificationEmail: (_key: unknown, options: typeof resend.options) => {
    resend.options = options;
    return { mutate: resend.mutate, isPending: false };
  },
  useChangeUnverifiedEmail: (_key: unknown, options: typeof change.options) => {
    change.options = options;
    return { mutate: change.mutate, isPending: false };
  },
  useCreateOneUser: (_mutationKey: unknown, options: { onSuccess?: () => void }) => {
    createAccountOptions.current = options;
    return {
      mutate: mutateMock,
      isPending: pending.createAccount,
    };
  },
  useGetPublicPasswordPolicy: () => ({
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
  useFindManyKey: 'useFindManyKey',
  UseFindManyKeyFn: () => ['useFindManyKey'],
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
    pending.createAccount = false;
    resend.mutate.mockReset();
    change.mutate.mockReset();
    sessionStorage.clear();
    localStorage.clear();
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

  it.each([
    ['en', 'Create account'],
    ['de', 'Konto erstellen'],
  ] as const)('keeps the %s create-account action visible and named while pending', (language, label) => {
    locale.current = language;
    pending.createAccount = true;
    renderForm();

    const button = screen.getByRole('button', { name: label });
    expect(button).toBeDisabled();
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
      body: {
        username: 'Jane_Doe',
        password: 'correct-horse-battery-staple-42',
        email: 'test@example.com',
        strategy: 'LOCAL_PASSWORD',
      },
    });
  });

  async function register(user: ReturnType<typeof userEvent.setup>) {
    renderForm();
    await user.type(screen.getByLabelText('Username'), 'jane');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.org');
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple-42');
    await user.type(screen.getByLabelText('Confirm your password'), 'correct-horse-battery-staple-42');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    act(() => createAccountOptions.current?.onSuccess?.());
  }

  describe('after registering', () => {
    it('replaces the form with a focused check-your-email screen without 2FA or storage', async () => {
      const user = userEvent.setup();
      await register(user);

      const heading = screen.getByRole('heading', { level: 2, name: 'Check your email' });
      expect(heading).toHaveFocus();
      expect(screen.getByText('jane@example.org').tagName).toBe('STRONG');
      expect(screen.queryByRole('form')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText(/two-factor|2FA/i)).toBeNull();
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
      for (const name of ['Resend email', 'Change email address', 'Back to sign in']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
    });

    it('goes to sign-in from "Back to sign in"', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
      expect(onHasAccountMock).toHaveBeenCalledTimes(1);
    });

    it('resends to the shown address in one click and reports it as a status', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Resend email' }));
      expect(resend.mutate).toHaveBeenCalledWith({ body: { email: 'jane@example.org' } });

      act(() => resend.options?.onSuccess?.());
      expect(screen.getByRole('status')).toHaveTextContent('We sent a new activation link to jane@example.org.');
    });

    it('announces a translated resend error', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Resend email' }));

      act(() =>
        resend.options?.onError?.({ message: 'x', body: { message: 'TooManyAuthAttempts', retryAfterSeconds: 30 } }),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Too many sign-in attempts');
      expect(screen.getByRole('alert')).toHaveTextContent('30');
    });

    it('changes the address with the registration credentials and shows the new one', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Change email address' }));
      await user.type(screen.getByLabelText('New email address'), ' new@example.org ');
      await user.click(screen.getByRole('button', { name: 'Send activation link' }));

      expect(change.mutate).toHaveBeenCalledWith({
        body: { identifier: 'jane', password: 'correct-horse-battery-staple-42', newEmail: 'new@example.org' },
      });
      act(() => change.options?.onSuccess?.());

      expect(screen.getByText('new@example.org', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('We sent a new activation link to new@example.org.');
      expect(screen.queryByLabelText('New email address')).toBeNull();
      expect(sessionStorage.length + localStorage.length).toBe(0);
    });

    it('shows a change error inline and keeps the form, and cancel returns to the confirmation', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Change email address' }));
      await user.type(screen.getByLabelText('New email address'), 'taken@example.org');
      await user.click(screen.getByRole('button', { name: 'Send activation link' }));

      act(() => change.options?.onError?.({ message: 'x', body: { message: 'Email already exists' } }));
      expect(screen.getByRole('alert')).toHaveTextContent('Email already in use');
      expect(screen.getByLabelText('New email address')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('New email address')).toBeNull();
      expect(screen.getByText('jane@example.org', { selector: 'strong' })).toBeInTheDocument();
    });

    it('does not submit an invalid new address', async () => {
      const user = userEvent.setup();
      await register(user);
      await user.click(screen.getByRole('button', { name: 'Change email address' }));
      await user.type(screen.getByLabelText('New email address'), 'not-an-email');
      expect(screen.getByRole('button', { name: 'Send activation link' })).toBeDisabled();
    });

    it('is fully translated in German', async () => {
      locale.current = 'de';
      const user = userEvent.setup();
      renderForm();
      await user.type(screen.getByLabelText(de.username), 'jane');
      await user.type(screen.getByLabelText(de.email), 'jane@example.org');
      await user.type(screen.getByLabelText(de.password), 'correct-horse-battery-staple-42');
      await user.type(screen.getByLabelText(de.passwordConfirmation), 'correct-horse-battery-staple-42');
      await user.click(screen.getByRole('button', { name: de.createAccountButton }));
      act(() => createAccountOptions.current?.onSuccess?.());

      expect(screen.getByRole('heading', { name: 'Prüfe deine E-Mails' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'E-Mail erneut senden' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'E-Mail-Adresse ändern' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zurück zur Anmeldung' })).toBeInTheDocument();
    });
  });
});
