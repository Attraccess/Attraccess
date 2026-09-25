import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './loginForm';
import { TestWrapper } from '../../test-utils/wrappers';
import en from './loginForm.en.json';
import de from './loginForm.de.json';

const loginMock = vi.fn();
const resendMutateMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));
const labels = { en, de };
let loginError: Error | null = null;
let resendOnSuccess: (() => void) | undefined;
let resendOnError: ((error: unknown) => void) | undefined;

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

vi.mock('../../hooks/useAuth', () => ({
  useLogin: () => ({
    mutate: loginMock,
    isPending: false,
    error: loginError,
  }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {
    body: Record<string, unknown>;
    constructor(message: string, body: Record<string, unknown>) {
      super(message);
      this.body = body;
    }
  },
  useUsersServiceIsLocalSignupEnabled: () => ({
    data: { value: true },
    isLoading: false,
  }),
  useUsersServiceResendVerificationEmail: (options: {
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  }) => {
    resendOnSuccess = options?.onSuccess;
    resendOnError = options?.onError;
    return { mutate: resendMutateMock, isPending: false };
  },
}));

vi.mock('../../utils/apiError', () => ({
  getTranslationKeyForApiError: ({ error }: { error: { body?: { message?: string } } }) => {
    const message = error?.body?.message;
    if (message === 'UserEmailNotVerifiedException') {
      return { key: 'api.UserEmailNotVerifiedException' };
    }
    return { key: 'api.generic' };
  },
}));

const onNeedsAccountMock = vi.fn();
const onForgotPasswordMock = vi.fn();

function renderLogin() {
  return render(<LoginForm onNeedsAccount={onNeedsAccountMock} onForgotPassword={onForgotPasswordMock} />, {
    wrapper: TestWrapper,
  });
}

describe('LoginForm – resend verification email', () => {
  beforeEach(() => {
    loginMock.mockReset();
    resendMutateMock.mockReset();
    loginError = null;
    resendOnSuccess = undefined;
    resendOnError = undefined;
    locale.current = 'en';
  });

  it('does not show resend section when there is no login error', () => {
    renderLogin();

    expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resend-verification-button')).not.toBeInTheDocument();
  });

  it('uses descriptive navigation and action labels', () => {
    renderLogin();

    expect(screen.getByRole('button', { name: labels.en.signUpButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.en.forgotPassword })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.en.signInButton })).toBeInTheDocument();
  });

  it('renders descriptive German navigation, field, recovery, and resend labels', () => {
    locale.current = 'de';
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText(labels.de.noAccount)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.de.signUpButton })).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.username)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.password)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.de.forgotPassword })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.de.signInButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.de.resendVerification.button })).toBeInTheDocument();
  });

  it('shows resend section when UserEmailNotVerifiedException occurs', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText(labels.en.resendVerification.prompt)).toBeInTheDocument();
    expect(screen.getByTestId('resend-email-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.en.resendVerification.button })).toBeInTheDocument();
  });

  it('does not show resend section for other login errors', () => {
    const apiError = new Error('Unauthorized') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UnkownUserOrPasswordException' };
    loginError = apiError;

    renderLogin();

    expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
  });

  it('calls resend mutation with entered email', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText(labels.en.resendVerification.emailLabel);
    await user.type(input, 'test@example.com');
    await user.click(screen.getByTestId('resend-verification-button'));

    expect(resendMutateMock).toHaveBeenCalledWith({
      requestBody: { email: 'test@example.com' },
    });
  });

  it('resend button is disabled when email is empty', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByTestId('resend-verification-button')).toBeDisabled();
  });

  it('resend button is disabled when email format is invalid', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText(labels.en.resendVerification.emailLabel);
    await user.type(input, 'not-an-email');

    expect(screen.getByTestId('resend-verification-button')).toBeDisabled();
  });

  it('trims surrounding whitespace before submitting the resend request', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText(labels.en.resendVerification.emailLabel);
    await user.type(input, '  test@example.com  ');
    await user.click(screen.getByTestId('resend-verification-button'));

    expect(resendMutateMock).toHaveBeenCalledWith({
      requestBody: { email: 'test@example.com' },
    });
  });

  it('renders the resend error alert when the mutation fails', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText(labels.en.resendVerification.emailLabel);
    await user.type(input, 'test@example.com');
    await user.click(screen.getByTestId('resend-verification-button'));

    const mutationError = new Error('boom') as Error & { body: Record<string, unknown> };
    mutationError.body = { message: 'GenericException' };
    act(() => resendOnError?.(mutationError));

    await waitFor(() => {
      expect(screen.getByTestId('resend-error-alert')).toBeInTheDocument();
    });
  });

  it('shows success alert after resend succeeds and hides the resend form', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText(labels.en.resendVerification.emailLabel);
    await user.type(input, 'test@example.com');
    await user.click(screen.getByTestId('resend-verification-button'));
    act(() => resendOnSuccess?.());

    await waitFor(() => {
      expect(screen.getByTestId('resend-success-alert')).toBeInTheDocument();
      expect(screen.getByText(labels.en.resendVerification.successTitle)).toBeInTheDocument();
      expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
    });
  });

  it('shows the error alert alongside the resend section', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText('Email not verified')).toBeInTheDocument();
    expect(screen.getByTestId('resend-verification-section')).toBeInTheDocument();
  });

  it('still shows login form elements alongside the resend section', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByLabelText(labels.en.username)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.en.password)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.en.signInButton })).toBeInTheDocument();
  });
});
