import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './loginForm';
import { TestWrapper } from '../../test-utils/wrappers';
import en from './loginForm.en.json';
import de from './loginForm.de.json';

const loginMock = vi.fn();
const resendMutateMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));
const pending = vi.hoisted(() => ({ login: false, resend: false }));
const signup = vi.hoisted(() => ({ enabled: true }));
const labels = { en, de };
let loginError: Error | null = null;
let resendOnSuccess: (() => void) | undefined;
let resendOnError: ((error: unknown) => void) | undefined;

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: (locales: Record<string, Record<string, unknown>>) => {
    const translations = locales[locale.current];
    const lookup = (key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
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
      return { ...mutation, isPending: mutation.isPending || pending.login, error: mutation.error ?? loginError };
    },
    ApiError: class ApiError extends Error {
      body: Record<string, unknown>;
      constructor(message: string, body: Record<string, unknown>) {
        super(message);
        this.body = body;
      }
    },
    useUsersServiceIsLocalSignupEnabled: () => ({
      data: { value: signup.enabled },
      isLoading: false,
    }),
    useUsersServiceResendVerificationEmail: (options: {
      onSuccess?: () => void;
      onError?: (error: unknown) => void;
    }) => {
      resendOnSuccess = options?.onSuccess;
      resendOnError = options?.onError;
      return { mutate: resendMutateMock, isPending: pending.resend };
    },
  };
});

vi.mock('../../utils/apiError', () => ({
  getTranslationKeyForApiError: ({ error }: { error: { body?: { message?: string } } }) => {
    const message = error?.body?.message;
    if (message === 'UserEmailNotVerifiedException') {
      return { key: 'api.UserEmailNotVerifiedException' };
    }
    if (message === 'TooManyAuthAttempts') {
      return { key: 'api.TooManyAuthAttempts' };
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
    pending.login = false;
    pending.resend = false;
    signup.enabled = true;
  });

  it('does not show resend section when there is no login error', () => {
    renderLogin();

    expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resend-verification-button')).not.toBeInTheDocument();
  });

  it('uses descriptive navigation and action labels', () => {
    renderLogin();

    expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps the sign-in action visible and named while pending', () => {
    pending.login = true;
    renderLogin();

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
  });

  it('keeps the resend action visible and named while pending', () => {
    pending.resend = true;
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;
    renderLogin();

    const button = screen.getByRole('button', { name: 'Resend verification email' });
    expect(button).toBeDisabled();
  });

  it.each([
    ['en', 'Sign in with email or username and password', 'Create an account'],
    ['de', 'Anmelden mit E-Mail oder Benutzername und Passwort', 'Konto erstellen'],
  ] as const)(
    'keeps the disabled-signup accordion action descriptive in %s',
    (language, accordionLabel, signupLabel) => {
      locale.current = language;
      signup.enabled = false;
      renderLogin();

      expect(screen.queryByRole('button', { name: signupLabel })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: accordionLabel })).toBeInTheDocument();
    },
  );

  it('renders descriptive German navigation, field, recovery, and resend labels', () => {
    locale.current = 'de';
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText(labels.de.noAccount)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konto erstellen' })).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.username)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.de.password)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passwort vergessen?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-Mail-Adresse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifizierungsmail erneut senden' })).toBeInTheDocument();
  });

  it('keeps the German resend action visible and named while pending', () => {
    locale.current = 'de';
    pending.resend = true;
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;
    renderLogin();

    const button = screen.getByRole('button', { name: 'Verifizierungsmail erneut senden' });
    expect(button).toBeDisabled();
  });

  it('shows resend section when UserEmailNotVerifiedException occurs', () => {
    const apiError = new Error('Forbidden') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UserEmailNotVerifiedException' };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText(labels.en.resendVerification.prompt)).toBeInTheDocument();
    expect(screen.getByTestId('resend-email-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument();
  });

  it('does not show resend section for other login errors', () => {
    const apiError = new Error('Unauthorized') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'UnkownUserOrPasswordException' };
    loginError = apiError;

    renderLogin();

    expect(screen.queryByTestId('resend-verification-section')).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'Please wait 17 seconds before trying to sign in again.'],
    ['de', 'Bitte warte 17 Sekunden, bevor du dich erneut anmeldest.'],
  ] as const)('shows the rate-limit retry time in %s', (language, message) => {
    locale.current = language;
    const apiError = new Error('Too many attempts') as Error & { body: Record<string, unknown> };
    apiError.body = { message: 'TooManyAuthAttempts', retryAfterSeconds: 17 };
    loginError = apiError;

    renderLogin();

    expect(screen.getByText(message)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

function apiFailure(message: string) {
  return Object.assign(new Error(message), { body: { message } });
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email or username'), 'alice@example.com');
  await user.type(screen.getByLabelText('Password'), ' password ');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginForm credential and authenticator steps', () => {
  beforeEach(() => {
    signup.enabled = true;
    locale.current = 'en';
    pending.login = false;
    pending.resend = false;
    loginMock.mockReset();
    loginError = null;
  });

  it('keeps local login available through the accordion when signup is disabled', async () => {
    signup.enabled = false;
    const user = userEvent.setup();
    renderLogin();
    expect(screen.queryByRole('button', { name: 'Create an account' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
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
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
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
    await user.click(screen.getByRole('button', { name: 'Change email, username or password' }));
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
    const identifier = screen.getByLabelText('Email or username');
    expect(identifier).toHaveFocus();
    expect(identifier).not.toHaveAttribute('readonly');
    expect(screen.queryByText('Server Error')).not.toBeInTheDocument();
    await user.clear(identifier);
    await user.type(identifier, 'bob');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
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
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(loginMock).toHaveBeenLastCalledWith({ username: 'alice@example.com', password: ' password ', tokenLocation: 'cookie' });
      expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toHaveValue('');
    } else expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toBeInTheDocument();
  });

  it.each([
    ['en', 'Sign in', 'Verify code', 'Authenticator code'],
    ['de', 'Anmelden', 'Code bestätigen', 'Authenticator-Code'],
  ] as const)('keeps the authenticator action visibly named while pending in %s', async (language, signIn, verifyCode, codeLabel) => {
    locale.current = language;
    let finish: (() => void) | undefined;
    loginMock.mockRejectedValueOnce(apiFailure('TwoFactorRequired')).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; }),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(labels[language].username), 'alice@example.com');
    await user.type(screen.getByLabelText(labels[language].password), 'password');
    await user.click(screen.getByRole('button', { name: signIn }));
    await screen.findByRole('textbox', { name: codeLabel });
    await user.paste('012345');
    await user.click(screen.getByRole('button', { name: verifyCode }));
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(2));
    const button = screen.getByRole('button', { name: verifyCode });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(verifyCode);
    await act(async () => finish?.());
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
    expect(screen.getByRole('button', { name: 'Change email, username or password' })).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    await act(async () => finish?.());
  });
});
