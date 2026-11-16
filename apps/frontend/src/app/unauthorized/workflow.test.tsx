import type { ComponentProps, ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Unauthorized } from './unauthorized';
import { SSOLogin } from './ssoLogin';
import type { LoginForm } from './loginForm';
import type { RegistrationForm } from './registrationForm';
import type { PasswordResetForm } from './password-reset/passwordResetForm';
const state = vi.hoisted(() => ({
  setup: false,
  checking: false,
  loading: false,
  providers: undefined as undefined | { id: number; name: string; type: string }[],
  link: vi.fn(),
  callbackUrl: vi.fn(),
  apiError: vi.fn(),
  toastError: vi.fn(),
  callbacks: undefined as undefined | { onSuccess: () => void; onError: (error: Error) => void; onSettled: () => void },
}));
vi.mock('@attraccess/react-query-client', () => ({
  SSOProviderType: { OIDC: 'OIDC', SAML: 'SAML' },
  useSettingsServiceGetFirstTimeSetupStatus: () => ({ data: { available: state.setup }, isLoading: state.checking }),
  useAuthenticationServiceGetAllSsoProviders: () => ({ data: state.providers, isLoading: state.loading }),
  useAuthenticationServiceLinkUserToExternalAccount: (options: typeof state.callbacks) => {
    state.callbacks = options;
    return { mutate: state.link, isPending: false };
  },
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ apiError: state.apiError, error: state.toastError }),
}));
vi.mock('./use-sso-callback-url', () => ({
  useCallbackURL: (...args: unknown[]) => {
    state.callbackUrl(...args);
    return 'http://localhost/linked';
  },
}));
vi.mock('./unauthorized-layout/layout', () => ({
  UnauthorizedLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./loginForm', () => ({
  LoginForm: ({ onNeedsAccount, onForgotPassword }: ComponentProps<typeof LoginForm>) => (
    <div>
      Local login<button onClick={onNeedsAccount}>Register</button>
      <button onClick={onForgotPassword}>Reset password</button>
    </div>
  ),
}));
vi.mock('./registrationForm', () => ({
  RegistrationForm: ({ onHasAccount }: ComponentProps<typeof RegistrationForm>) => (
    <div>
      Registration<button onClick={onHasAccount}>Return to login</button>
    </div>
  ),
}));
vi.mock('./password-reset/passwordResetForm', () => ({
  PasswordResetForm: ({ onGoBack }: ComponentProps<typeof PasswordResetForm>) => (
    <div>
      Password reset<button onClick={onGoBack}>Return to login</button>
    </div>
  ),
}));
vi.mock('./passkeyLogin', () => ({ PasskeyLogin: () => <p>Passkey login</p> }));
beforeEach(() => {
  vi.clearAllMocks();
  state.setup = false;
  state.checking = false;
  state.loading = false;
  state.providers = [];
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});
function mount(path = '/', onlySso = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={onlySso ? <SSOLogin /> : <Unauthorized />} />
        <Route path="/first-time-setup" element={<p>Setup wizard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('switches between login, registration and reset while limiting passkey login to the login screen', () => {
  mount();
  expect(screen.getByText('Passkey login')).toBeTruthy();
  fireEvent.click(screen.getByText('Register'));
  expect(screen.getByText('Registration')).toBeTruthy();
  expect(screen.queryByText('Passkey login')).toBeNull();
  fireEvent.click(screen.getByText('Return to login'));
  fireEvent.click(screen.getByText('Reset password'));
  expect(screen.getByText('Password reset')).toBeTruthy();
  fireEvent.click(screen.getByText('Return to login'));
  expect(screen.getByText('Local login')).toBeTruthy();
});
it('waits for setup status before redirecting to first-time setup', async () => {
  state.setup = true;
  state.checking = true;
  const view = mount();
  expect(screen.queryByText('Setup wizard')).toBeNull();
  view.unmount();
  state.checking = false;
  mount();
  expect(await screen.findByText('Setup wizard')).toBeTruthy();
});
it('renders provider links only after providers finish loading', () => {
  state.providers = [{ id: 7, name: 'Company', type: 'OIDC' }];
  state.loading = true;
  const view = mount('/', true);
  expect(screen.queryByRole('link')).toBeNull();
  view.unmount();
  state.loading = false;
  mount('/', true);
  expect(screen.getByRole('link', { name: 'Login with Company' })).toHaveAttribute('href', 'http://localhost/linked');
  expect(state.callbackUrl).toHaveBeenCalledWith(7, 'OIDC');
});
it('decodes an account-link token, submits its password and redirects only on success', async () => {
  const token =
    btoa(JSON.stringify({ email: 'alex@example.test', providerId: 7, providerType: 'SAML' })).replace(/=/g, '') +
    '.signature';
  state.providers = [{ id: 7, name: 'Company', type: 'SAML' }];
  mount(`/?accountLinking=required&ssoLinkToken=${encodeURIComponent(token)}`, true);
  expect(await screen.findByRole('dialog')).toHaveTextContent('alex@example.test');
  expect(state.callbackUrl).toHaveBeenCalledWith(7, 'SAML', expect.any(String));
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Link account' }));
  expect(state.link).toHaveBeenCalledWith({ requestBody: { linkToken: token, password: 'test-password' } });
  act(() => state.callbacks?.onError(Object.assign(new Error('Unauthorized'), { body: { message: 'Unauthorized' } })));
  expect(state.toastError).toHaveBeenLastCalledWith({ title: 'Invalid password. Please try again.' });
  act(() =>
    state.callbacks?.onError(
      Object.assign(new Error('x'), { body: { message: 'TooManyAuthAttempts', retryAfterSeconds: 42 } }),
    ),
  );
  expect(state.toastError).toHaveBeenLastCalledWith(
    expect.objectContaining({ description: expect.stringContaining('42') }),
  );
  act(() =>
    state.callbacks?.onError(
      Object.assign(new Error('x'), { body: { message: 'AccountLocked', retryAfterSeconds: 60 } }),
    ),
  );
  expect(state.toastError).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Account temporarily locked', description: expect.stringContaining('60') }),
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  act(() => state.callbacks?.onSuccess());
  await waitFor(() => expect(window.location.href).toBe('http://localhost/linked'));
});
it('sends one request per submit so a double click cannot burn a second password attempt', async () => {
  const token =
    btoa(JSON.stringify({ email: 'alex@example.test', providerId: 7, providerType: 'OIDC' })) + '.signature';
  state.providers = [{ id: 7, name: 'Company', type: 'OIDC' }];
  mount(`/?accountLinking=required&ssoLinkToken=${encodeURIComponent(token)}`, true);
  const button = await screen.findByRole('button', { name: 'Link account' });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(state.link).toHaveBeenCalledTimes(1);
  act(() => state.callbacks?.onSettled());
  fireEvent.click(button);
  expect(state.link).toHaveBeenCalledTimes(2);
});
it('survives malformed tokens, favors an explicit email, and refuses a missing token', async () => {
  state.providers = [{ id: 7, name: 'Company', type: 'OIDC' }];
  let view = mount('/?accountLinking=required&email=explicit%40example.test&ssoLinkToken=invalid', true);
  expect(await screen.findByRole('dialog')).toHaveTextContent('explicit@example.test');
  expect(state.callbackUrl).toHaveBeenCalledWith(-1, 'OIDC', expect.any(String));
  view.unmount();
  view = mount('/?accountLinking=required', true);
  const linkButton = await screen.findByRole('button', { name: 'Link account' });
  expect(linkButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(linkButton);
  expect(state.link).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Sign in with SSO again' })).toBeNull();
  act(() => state.callbacks?.onError(Object.assign(new Error('x'), { body: { message: 'INVALID_LINK_TOKEN' } })));
  expect(screen.queryByRole('button', { name: 'Link account' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign in with SSO again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
  view.unmount();
  state.providers = undefined;
  mount('/', true);
  expect(screen.queryByRole('link')).toBeNull();
});

describe('account-link modal errors and exits', () => {
  const token =
    btoa(JSON.stringify({ email: 'alex@example.test', providerId: 7, providerType: 'OIDC' })).replace(/=/g, '') +
    '.signature';
  const mountLinking = async () => {
    state.providers = [{ id: 7, name: 'Company', type: 'OIDC' }];
    window.history.replaceState({}, '', `/?accountLinking=required&ssoLinkToken=${encodeURIComponent(token)}`);
    mount(`/?accountLinking=required&ssoLinkToken=${encodeURIComponent(token)}`, true);
    await screen.findByRole('dialog');
  };
  const fail = (body: Record<string, unknown>) =>
    act(() => state.callbacks?.onError(Object.assign(new Error('x'), { body })));

  it.each(['LINK_TOKEN_USED', 'LINK_TOKEN_EXHAUSTED', 'LINK_TOKEN_EXPIRED', 'INVALID_LINK_TOKEN'])(
    'offers a fresh SSO sign-in once the server rejects the link token with %s',
    async (code) => {
      await mountLinking();
      expect(screen.queryByRole('button', { name: 'Sign in with SSO again' })).toBeNull();
      fail({ message: code });
      expect(state.toastError).toHaveBeenLastCalledWith({
        title: 'Link no longer valid',
        description: 'This link is no longer valid. Please sign in with your company account again.',
      });
      expect(screen.queryByRole('button', { name: 'Link account' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with SSO again' }));
      await waitFor(() => expect(window.location.href).toBe('http://localhost/linked'));
    },
  );

  it.each([
    ['SSO_ALREADY_LINKED', 'This account is already linked to SSO.'],
    [
      'PASSWORD_REQUIRED',
      'This account has no password yet. Use “Forgot password?” on the sign-in page to set one, then try again.',
    ],
    ['SSO_SUBJECT_ALREADY_LINKED', 'This SSO identity is already linked to another account.'],
  ])('explains %s with the modal text and keeps the link form', async (code, title) => {
    await mountLinking();
    fail({ message: code });
    expect(state.toastError).toHaveBeenLastCalledWith({ title });
    expect(screen.getByRole('button', { name: 'Link account' })).toBeTruthy();
  });

  it('returns to the clean sign-in page without the link parameters', async () => {
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    await mountLinking();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(replace).toHaveBeenCalledWith('http://localhost/');
    replace.mockRestore();
  });
});
