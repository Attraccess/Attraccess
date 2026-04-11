import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './loginForm';
import { TestWrapper } from '../../test-utils/wrappers';

const loginMock = vi.fn();
const resendMutateMock = vi.fn();
let loginError: Error | null = null;
let resendOnSuccess: (() => void) | undefined;

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Welcome back, maker!',
      noAccount: 'First time here?',
      signUpButton: 'Get started here',
      username: 'Username',
      password: 'Password',
      twoFactorCode: 'Authenticator code',
      twoFactorHelper: 'Enter the code if you already set up 2FA.',
      forgotPassword: 'Password slipped your mind?',
      signInButton: 'Start making',
      signingIn: 'Signing in...',
      'accordion.title': 'Sign in with email and password',
      'api.UserEmailNotVerifiedException.title': 'Email not verified',
      'api.UserEmailNotVerifiedException.description': 'Please verify your email before signing in.',
      'api.generic.title': 'Server Error',
      'api.generic.description': '{{error}}',
      'resendVerification.prompt': "Didn't receive the verification email?",
      'resendVerification.emailLabel': 'Email address',
      'resendVerification.button': 'Resend verification email',
      'resendVerification.successTitle': 'Email sent!',
      'resendVerification.successMessage': 'A new verification link has been sent.',
    };

    const t = (key: string) => translations[key] ?? key;
    const tExists = (key: string) => Boolean(translations[key]);
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
  useUsersServiceResendVerificationEmail: (options: { onSuccess?: () => void }) => {
    resendOnSuccess = options?.onSuccess;
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
  });

  it('does not show resend section when there is no login error', () => {
    renderLogin();

    expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resend-verification-button')).not.toBeInTheDocument();
  });

  it('shows resend section when UserEmailNotVerifiedException occurs', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText("Didn't receive the verification email?")).toBeInTheDocument();
    expect(screen.getByTestId('resend-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
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

    const input = screen.getByLabelText('Email address');
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

  it('shows success alert after resend succeeds and hides the resend form', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText('Email address');
    await user.type(input, 'test@example.com');
    await user.click(screen.getByTestId('resend-verification-button'));
    resendOnSuccess?.();

    await waitFor(() => {
      expect(screen.getByTestId('resend-success-alert')).toBeInTheDocument();
      expect(screen.getByText('Email sent!')).toBeInTheDocument();
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

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start making' })).toBeInTheDocument();
  });
});
