import type { ComponentProps, ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  callbacks: undefined as undefined | { onSuccess: () => void; onError: (error: Error) => void },
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
vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => ({ apiError: state.apiError }) }));
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
  const error = new Error('Wrong password');
  act(() => state.callbacks?.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(
    expect.objectContaining({ error, baseTranslationKey: 'errors', fallbackKey: 'unknown' }),
  );
  expect(screen.getByRole('dialog')).toBeTruthy();
  act(() => state.callbacks?.onSuccess());
  await waitFor(() => expect(window.location.href).toBe('http://localhost/linked'));
});
it('survives malformed tokens, favors an explicit email, and refuses a missing token', async () => {
  state.providers = [{ id: 7, name: 'Company', type: 'OIDC' }];
  let view = mount('/?accountLinking=required&email=explicit%40example.test&ssoLinkToken=invalid', true);
  expect(await screen.findByRole('dialog')).toHaveTextContent('explicit@example.test');
  expect(state.callbackUrl).toHaveBeenCalledWith(-1, 'OIDC', expect.any(String));
  view.unmount();
  view = mount('/?accountLinking=required', true);
  fireEvent.click(await screen.findByRole('button', { name: 'Link account' }));
  expect(state.link).not.toHaveBeenCalled();
  view.unmount();
  state.providers = undefined;
  mount('/', true);
  expect(screen.queryByRole('link')).toBeNull();
});
