import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './loginForm';
import { TestWrapper } from '../../test-utils/wrappers';

const loginMock = vi.fn();
const resendMutateMock = vi.fn();
let signupEnabled = true;
let loginError: Error | null = null;
let resendOnSuccess: (() => void) | undefined;
let resendOnError: ((error: unknown) => void) | undefined;

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      title: 'Welcome back, maker!',
      noAccount: 'First time here?',
      signUpButton: 'Get started here',
      username: 'Email or username',
      password: 'Password',
      twoFactorCode: 'Authenticator code',
      twoFactorInstruction: 'Enter the six-digit code from your authenticator app.',
      verifyCode: 'Verify code',
      changeCredentials: 'Change credentials',
      forgotPassword: 'Password slipped your mind?',
      signInButton: 'Start making',
      signingIn: 'Signing in...',
      'accordion.title': 'Sign in with email or username and password',
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

vi.mock('../../utils/live-updates', () => ({ resumeLiveUpdates: vi.fn(), stopLiveUpdates: vi.fn() }));

vi.mock('@attraccess/react-query-client', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    UseUsersServiceGetCurrentKeyFn: () => ['current-user'],
    useAuthenticationServiceCreateSession: (options: { onSuccess?: () => void }) => {
      const mutation = useMutation({
        mutationFn: (data: { requestBody: unknown }) => loginMock(data.requestBody),
        onSuccess: options.onSuccess,
      });
      return { ...mutation, error: mutation.error ?? loginError };
    },
    ApiError: class ApiError extends Error {
      body: Record<string, unknown>;
      constructor(message: string, body: Record<string, unknown>) {
        super(message);
        this.body = body;
      }
    },
    useUsersServiceIsLocalSignupEnabled: () => ({
      data: { value: signupEnabled },
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
  };
});

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
    signupEnabled = true;
    loginMock.mockReset();
    resendMutateMock.mockReset();
    loginError = null;
    resendOnSuccess = undefined;
    resendOnError = undefined;
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

  it('resend button is disabled when email format is invalid', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText('Email address');
    await user.type(input, 'not-an-email');

    expect(screen.getByTestId('resend-verification-button')).toBeDisabled();
  });

  it('trims surrounding whitespace before submitting the resend request', async () => {
    const user = userEvent.setup();
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    const input = screen.getByLabelText('Email address');
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

    const input = screen.getByLabelText('Email address');
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

    const input = screen.getByLabelText('Email address');
    await user.type(input, 'test@example.com');
    await user.click(screen.getByTestId('resend-verification-button'));
    act(() => resendOnSuccess?.());

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

    expect(screen.getByLabelText('Email or username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start making' })).toBeInTheDocument();
  });
});

function apiFailure(message: string) {
  return Object.assign(new Error(message), { body: { message } });
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email or username'), 'alice@example.com');
  await user.type(screen.getByLabelText('Password'), ' password ');
  await user.click(screen.getByRole('button', { name: 'Start making' }));
}

describe('LoginForm credential and authenticator steps', () => {
  beforeEach(() => {
    signupEnabled = true;
    loginMock.mockReset();
    loginError = null;
  });

  it('keeps local login available through the accordion when signup is disabled', async () => {
    signupEnabled = false;
    const user = userEvent.setup();
    renderLogin();
    expect(screen.queryByRole('button', { name: 'Get started here' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in with email or username and password' }));
    expect(screen.getByLabelText('Email or username')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Authenticator code' })).not.toBeInTheDocument();
  });

  it('starts with credentials only and submits actual autofilled form values without a code', async () => {
    const user = userEvent.setup();
    renderLogin();
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
    const identifier = screen.getByLabelText('Email or username');
    const password = screen.getByLabelText('Password');
    expect(identifier).toHaveAttribute('name', 'username');
    expect(identifier).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    // Password managers may fill native input values without firing React events.
    (identifier as HTMLInputElement).value = 'alice@example.com';
    (password as HTMLInputElement).value = ' password ';
    await user.click(screen.getByRole('button', { name: 'Start making' }));
    expect(loginMock).toHaveBeenCalledWith({ username: 'alice@example.com', password: ' password ', tokenLocation: 'cookie' });
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
  });

  it('keeps native autofill visible and masked when the authenticator step opens', async () => {
    loginMock.mockRejectedValue(apiFailure('TwoFactorRequired'));
    const user = userEvent.setup();
    renderLogin();
    const identifier = screen.getByLabelText('Email or username');
    const password = screen.getByLabelText('Password');
    (identifier as HTMLInputElement).value = 'alice@example.com';
    (password as HTMLInputElement).value = ' password ';
    await user.click(screen.getByRole('button', { name: 'Start making' }));
    await screen.findByRole('textbox', { name: 'Authenticator code' });
    expect(screen.getByLabelText('Email or username')).toBe(identifier);
    expect(screen.getByLabelText('Password')).toBe(password);
    expect(identifier).toHaveValue('alice@example.com');
    expect(password).toHaveValue(' password ');
    expect(password).toHaveAttribute('type', 'password');
  });

  it.each(['UnkownUserOrPasswordException', 'UserEmailNotVerifiedException', 'TwoFactorInvalidCode', 'TwoFactorRequiredExtra'])('does not challenge on %s', async (message) => {
    loginMock.mockRejectedValue(apiFailure(message));
    const user = userEvent.setup();
    renderLogin();
    await submitCredentials(user);
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
    expect(screen.getByText(message === 'UserEmailNotVerifiedException' ? 'Email not verified' : 'Server Error')).toBeInTheDocument();
  });

  it('focuses one named code control, preserves credentials, pastes leading zeroes and retries invalid codes', async () => {
    loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired')).mockRejectedValueOnce(apiFailure('TwoFactorInvalidCode')).mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderLogin();
    const identifier = screen.getByLabelText('Email or username');
    const password = screen.getByLabelText('Password');
    await submitCredentials(user);
    const code = screen.getByRole('textbox', { name: 'Authenticator code' });
    expect(screen.getByRole('group', { name: 'Authenticator code' })).toBeInTheDocument();
    expect(code).toHaveFocus();
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.queryByText('Server Error')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email or username')).toBe(identifier);
    expect(screen.getByLabelText('Password')).toBe(password);
    expect(identifier).toHaveAttribute('readonly');
    expect(password).toHaveAttribute('readonly');
    expect(password).toHaveValue(' password ');
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(loginMock).toHaveBeenLastCalledWith({ username: 'alice@example.com', password: ' password ', twoFactorCode: '012345', tokenLocation: 'cookie' });
    expect(code).toBeInTheDocument();
    expect(screen.getByText('Server Error')).toBeInTheDocument();
    await user.click(code);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('065432');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(loginMock).toHaveBeenLastCalledWith(expect.objectContaining({ twoFactorCode: '065432' }));
  });

  it('clears the previous code and error when credentials change', async () => {
    loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired'))
      .mockRejectedValueOnce(apiFailure('TwoFactorInvalidCode'))
      .mockRejectedValueOnce(apiFailure('TwoFactorRequired'));
    const user = userEvent.setup();
    renderLogin();
    await submitCredentials(user);
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(screen.getByText('Server Error')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change credentials' }));
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
    const identifier = screen.getByLabelText('Email or username');
    expect(identifier).toHaveFocus();
    expect(identifier).not.toHaveAttribute('readonly');
    expect(screen.queryByText('Server Error')).not.toBeInTheDocument();
    await user.clear(identifier);
    await user.type(identifier, 'bob');
    await user.click(screen.getByRole('button', { name: 'Start making' }));
    expect(loginMock).toHaveBeenLastCalledWith({ username: 'bob', password: ' password ', tokenLocation: 'cookie' });
    expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toHaveValue('');
  });

  it.each(['TooManyAuthAttemptsException', 'network failure', 'UnkownUserOrPasswordException', 'UserEmailNotVerifiedException', 'LOCAL_LOGIN_FOR_SSO_FORBIDDEN'])('handles %s during the code step', async (message) => {
    loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired')).mockRejectedValueOnce(apiFailure(message));
    const user = userEvent.setup();
    renderLogin();
    await submitCredentials(user);
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));
    if (['UnkownUserOrPasswordException', 'UserEmailNotVerifiedException', 'LOCAL_LOGIN_FOR_SSO_FORBIDDEN'].includes(message)) {
      expect(screen.queryByRole('textbox', { name: 'Authenticator code' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email or username')).not.toHaveAttribute('readonly');
      expect(screen.getByLabelText('Password')).not.toHaveAttribute('readonly');
      loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired'));
      await user.click(screen.getByRole('button', { name: 'Start making' }));
      expect(loginMock).toHaveBeenLastCalledWith({ username: 'alice@example.com', password: ' password ', tokenLocation: 'cookie' });
      expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toHaveValue('');
    } else expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toBeInTheDocument();
  });

  it('blocks incomplete-code Enter and duplicate requests, including switching while pending', async () => {
    let finish: (() => void) | undefined;
    loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired')).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const { container } = renderLogin();
    await submitCredentials(user);
    await user.paste('012');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Verify code' })).toBeDisabled();
    await user.paste('345');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Change credentials' })).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    await act(async () => finish?.());
  });
});
