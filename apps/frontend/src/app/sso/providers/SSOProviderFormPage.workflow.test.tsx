import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SSOProviderFormPage } from './SSOProviderFormPage';
const state = vi.hoisted(() => ({
  permission: true,
  modules: ['sso'],
  loading: false,
  provider: undefined as unknown,
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.permission }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useAuthenticationServiceDiscoverAuthentikOidc: () => ({ data: undefined, isFetching: false }),
  useAuthenticationServiceDiscoverKeycloakOidc: () => ({ data: undefined, isFetching: false }),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: state.modules } }),
  useAuthenticationServiceGetOneSsoProviderById: () => ({ data: state.provider, isLoading: state.loading }),
  useAuthenticationServiceCreateOneSsoProvider: () => ({ mutateAsync: state.create, isPending: false }),
  useAuthenticationServiceUpdateOneSsoProvider: () => ({ mutateAsync: state.update, isPending: false }),
  useRbacServiceListRoles: () => ({ data: [], isLoading: false }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.permission = true;
  state.modules = ['sso'];
  state.loading = false;
  state.provider = undefined;
  state.create.mockResolvedValue({ id: 8 });
  state.update.mockResolvedValue({ id: 8 });
});
afterEach(cleanup);
function mount(id = 'new') {
  return render(
    <MemoryRouter initialEntries={[`/settings/sso/providers/${id}`]}>
      <Routes>
        <Route path="/settings/sso/providers/:providerId" element={<SSOProviderFormPage />} />
        <Route path="/settings/sso" element={<p>Provider list</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
function input(cy: string) {
  const element = document.querySelector(`[data-cy="sso-provider-form-${cy}-input"]`);
  if (!element) throw new Error(cy);
  return element;
}
it('edits and saves an OIDC provider with credentials and claim lists through the real form', async () => {
  mount('invalid');
  fireEvent.change(input('name'), { target: { value: 'Company login' } });
  for (const [field, value] of [
    ['issuer', 'https://idp.example'],
    ['authorization-url', 'https://idp.example/auth'],
    ['token-url', 'https://idp.example/token'],
    ['user-info-url', 'https://idp.example/userinfo'],
    ['client-id', 'client'],
    ['client-secret', 'secret'],
    ['scopes', 'openid, email'],
    ['username-claims', 'preferred_username, sub'],
    ['email-claims', 'email'],
  ])
    fireEvent.change(input(`oidc-${field}`), { target: { value } });
  expect(input('oidc-client-secret')).toHaveAttribute('type', 'password');
  fireEvent.click(document.querySelector('[data-cy="sso-provider-form-oidc-toggle-client-secret-button"]')!);
  expect(input('oidc-client-secret')).toHaveAttribute('type', 'text');
  fireEvent.click(document.querySelector('[data-cy="sso-provider-form-oidc-toggle-client-secret-button"]')!);
  expect(input('oidc-client-secret')).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith({
      requestBody: expect.objectContaining({
        name: 'Company login',
        type: 'OIDC',
        oidcConfiguration: expect.objectContaining({
          issuer: 'https://idp.example',
          clientId: 'client',
          clientSecret: 'secret',
          scopes: ['openid', 'email'],
          usernameClaimPaths: ['preferred_username', 'sub'],
          emailClaimPaths: ['email'],
        }),
      }),
    }),
  );
  expect(await screen.findByText('Provider list')).toBeTruthy();
});
it('switches to SAML and cancels without writing', async () => {
  mount('invalid');
  fireEvent.click(screen.getByRole('button', { name: 'OIDC' }));
  fireEvent.click(await screen.findByRole('option', { name: 'SAML' }));
  expect(screen.getByLabelText(/Entry Point/)).toBeTruthy();
  expect(screen.queryByLabelText(/Client ID/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('Provider list')).toBeTruthy();
  expect(state.create).not.toHaveBeenCalled();
});
it('loads existing providers with a fixed protocol and saves updates', async () => {
  state.provider = {
    id: 8,
    name: 'Existing',
    type: 'OIDC',
    oidcConfiguration: { issuer: 'https://idp.example', clientId: 'client', clientSecret: 'secret' },
  };
  mount('8');
  expect(await screen.findByDisplayValue('Existing')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'OIDC' })).toBeDisabled();
  fireEvent.change(input('name'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, requestBody: expect.objectContaining({ name: 'Renamed' }) }),
    ),
  );
});
it('enforces permission, license and provider loading gates', () => {
  state.permission = false;
  let view = mount();
  expect(screen.getByText('Home')).toBeTruthy();
  view.unmount();
  state.permission = true;
  state.modules = [];
  view = mount();
  expect(document.querySelector('[data-cy="sso-provider-form"]')).toBeNull();
  view.unmount();
  state.modules = ['sso'];
  state.loading = true;
  mount('8');
  expect(document.querySelector('[data-cy="sso-provider-form-page-loading-spinner"]')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});
