import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSOProviderType } from '@attraccess/react-query-client';
import { SAMLConfigForm } from './form/SAMLConfigForm';
import { SetupInstructionsSection } from './form/SetupInstructionsSection';
import { useSSOProviderSetupUrls } from './useSSOProviderSetupUrls';
import { useSSOProviderForm } from './useSSOProviderForm';

const state = vi.hoisted(() => ({
  provider: undefined as unknown,
  create: vi.fn(),
  update: vi.fn(),
  navigate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
  t: (key: string) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: state.t }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useAuthenticationServiceCreateOneSsoProvider: () => ({ mutateAsync: state.create, isPending: false }),
  useAuthenticationServiceUpdateOneSsoProvider: () => ({ mutateAsync: state.update, isPending: false }),
  useAuthenticationServiceGetOneSsoProviderById: () => ({ data: state.provider, isLoading: false }),
  useRbacServiceListRoles: () => ({ data: [], isLoading: false }),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.provider = undefined;
});

describe('SSO provider form', () => {
  it('loads OIDC claim lists and role mappings without losing provider configuration', () => {
    state.provider = {
      id: 7,
      name: 'Organization',
      type: SSOProviderType.OIDC,
      oidcConfiguration: {
        issuer: 'https://idp.example',
        authorizationURL: 'https://idp.example/auth',
        tokenURL: 'https://idp.example/token',
        userInfoURL: 'https://idp.example/userinfo',
        clientId: 'app',
        clientSecret: 'existing',
        scopes: ['openid', 'email'],
        usernameClaimPaths: ['preferred_username'],
        emailClaimPaths: ['email'],
        roleMappings: { member: ['reader'] },
      },
    };
    const { result } = renderHook(() => useSSOProviderForm(7));
    expect(result.current.formValues).toMatchObject({
      name: 'Organization',
      type: SSOProviderType.OIDC,
      oidcConfiguration: { clientId: 'app', clientSecret: 'existing' },
    });
    expect(result.current.scopesInput).toBe('openid, email');
    expect(result.current.usernameClaimPathsInput).toBe('preferred_username');
    expect(result.current.emailClaimPathsInput).toBe('email');
    expect(result.current.samlRoleMappingEntries).toEqual([]);
  });
  it('loads SAML settings while keeping stored secrets out of editable inputs', () => {
    state.provider = {
      id: 8,
      name: 'SAML',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example/sso',
        issuer: 'urn:test',
        certificate: 'idp-cert',
        signRequest: true,
        spSigningCertificate: 'stored-cert',
        spSigningKeyEncrypted: 'encrypted',
        provisioningSecret: 'stored-secret',
        emailAttributeKeys: ['mail', 'email'],
        roleMappings: { member: ['reader'] },
      },
    };
    const { result } = renderHook(() => useSSOProviderForm(8));
    expect(result.current.formValues.samlConfiguration).toMatchObject({
      entryPoint: 'https://idp.example/sso',
      signRequest: true,
      spSigningCertificate: 'stored-cert',
      spSigningPrivateKey: '',
      provisioningSecret: '',
      wantAuthnResponseSigned: true,
    });
    expect(result.current.emailAttributeKeysInput).toBe('mail, email');
    expect(result.current.oidcRoleMappingEntries).toEqual([]);
    expect(result.current.isSaveDisabled).toBe(false);
  });
  it('creates an OIDC provider with parsed lists and preserved discovery credentials', async () => {
    const { result } = renderHook(() => useSSOProviderForm());
    act(() => {
      result.current.setOidc('clientId', 'client');
      result.current.setOidc('clientSecret', 'secret');
      result.current.setScopesInput(' openid, email, , ');
    });
    act(() =>
      result.current.onAutoDiscovery({
        issuer: 'https://idp.example',
        authorization_endpoint: 'https://idp.example/auth',
        token_endpoint: 'https://idp.example/token',
        userinfo_endpoint: 'https://idp.example/info',
      }),
    );
    await act(() => result.current.handleSubmit());
    expect(state.create).toHaveBeenCalledWith({
      requestBody: expect.objectContaining({
        type: SSOProviderType.OIDC,
        oidcConfiguration: expect.objectContaining({
          clientId: 'client',
          clientSecret: 'secret',
          scopes: ['openid', 'email'],
          issuer: 'https://idp.example',
        }),
      }),
    });
    expect(state.navigate).toHaveBeenCalledWith('/settings/sso');
    expect(state.success).toHaveBeenCalled();
  });
  it('clears removed SAML role mappings without overwriting unchanged secrets', async () => {
    state.provider = {
      id: 8,
      name: 'SAML',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example/sso',
        issuer: 'urn:test',
        roleMappings: { member: ['reader'] },
      },
    };
    const { result } = renderHook(() => useSSOProviderForm(8));
    act(() => {
      result.current.setSamlRoleMappingEntries([]);
      result.current.setEmailAttributeKeysInput(' mail, email ');
    });
    await act(() => result.current.handleSubmit());
    const payload = state.update.mock.calls[0][0];
    expect(payload.id).toBe(8);
    expect(payload.requestBody.samlConfiguration).toMatchObject({
      roleMappings: {},
      emailAttributeKeys: ['mail', 'email'],
    });
    expect(payload.requestBody.samlConfiguration).not.toHaveProperty('provisioningSecret');
    expect(payload.requestBody.samlConfiguration).not.toHaveProperty('spSigningPrivateKey');
    expect(payload.requestBody).not.toHaveProperty('oidcConfiguration');
  });
  it('blocks signing-enabled saves without a complete certificate and key', async () => {
    const { result } = renderHook(() => useSSOProviderForm());
    act(() => result.current.handleSelectChange(SSOProviderType.SAML));
    act(() => result.current.handleSamlToggleChange('signRequest', true));
    expect(result.current.isSaveDisabled).toBe(true);
    await act(() => result.current.handleSubmit());
    expect(state.create).not.toHaveBeenCalled();
    expect(state.error).toHaveBeenCalledWith({ title: 'errorGeneric', description: 'signingMaterialsMissing' });
  });
  it('keeps the form open when saving fails', async () => {
    state.create.mockRejectedValueOnce(new Error('provider conflict'));
    const { result } = renderHook(() => useSSOProviderForm());
    await act(() => result.current.handleSubmit());
    expect(state.error).toHaveBeenCalledWith({ title: 'errorGeneric', description: 'provider conflict' });
    expect(state.navigate).not.toHaveBeenCalled();
  });
});

function SamlEditor() {
  const form = useSSOProviderForm(8);
  return (
    <>
      <SAMLConfigForm form={form} />
      <button onClick={() => form.handleSubmit()}>Save fixture</button>
    </>
  );
}
it('edits SAML identity, signing and provisioning fields through the rendered controls', async () => {
  state.provider = {
    id: 8,
    name: 'SAML',
    type: SSOProviderType.SAML,
    samlConfiguration: {
      entryPoint: 'https://idp.test',
      issuer: 'app',
      certificate: 'existing-certificate',
      spSigningKeyEncrypted: true,
      roleMappings: {},
    },
  };
  state.update.mockResolvedValueOnce({});
  const { container } = render(<SamlEditor />);
  expect(screen.getByText('spSigningPrivateKeyHintExisting')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('entryPoint'), { target: { value: 'https://idp.test/saml' } });
  fireEvent.change(screen.getByLabelText('issuer'), { target: { value: 'workshop' } });
  fireEvent.change(screen.getByLabelText('audience'), { target: { value: 'members' } });
  fireEvent.change(screen.getByLabelText('emailAttributeKeys'), { target: { value: 'mail, email' } });
  fireEvent.change(screen.getByLabelText('samlProvisioningSecret'), { target: { value: 'new-secret' } });
  const toggle = container.querySelector('[data-cy="sso-provider-form-saml-provisioning-secret-toggle-button"]');
  if (!toggle) throw new Error('Missing secret visibility control');
  fireEvent.click(toggle);
  expect((screen.getByLabelText('samlProvisioningSecret') as HTMLInputElement).type).toBe('text');
  for (const [field, value] of [
    ['certificate', 'new-certificate'],
    ['spSigningCertificate', 'signing-cert'],
    ['spSigningPrivateKey', 'signing-key'],
  ]) {
    const input = container.querySelector(`[name="samlConfiguration.${field}"]`);
    if (!input) throw new Error(`Missing ${field}`);
    fireEvent.change(input, { target: { value } });
  }
  fireEvent.click(screen.getByRole('switch', { name: 'signRequest' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save fixture' }));
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0].requestBody.samlConfiguration).toMatchObject({
    entryPoint: 'https://idp.test/saml',
    issuer: 'workshop',
    audience: 'members',
    certificate: 'new-certificate',
    emailAttributeKeys: ['mail', 'email'],
    provisioningSecret: 'new-secret',
    spSigningCertificate: 'signing-cert',
    spSigningPrivateKey: 'signing-key',
    signRequest: true,
  });
});
function Setup({ saml, id }: { saml: boolean; id?: number }) {
  const urls = useSSOProviderSetupUrls(id);
  return <SetupInstructionsSection isSamlProvider={saml} setupUrls={urls} onCopy={state.success} />;
}
it('shows pending setup before save and copies the protocol-specific callback after save', () => {
  const view = render(<Setup saml={false} />);
  expect(screen.getAllByText('setupUrlPending').length).toBeGreaterThan(0);
  view.rerender(<Setup saml={false} id={8} />);
  const copy = () => {
    const button = view.container.querySelector('[data-cy="sso-provider-form-callback-url-copy-button"]');
    if (!button) throw new Error('Missing callback copy control');
    fireEvent.click(button);
  };
  copy();
  expect(state.success).toHaveBeenLastCalledWith(expect.stringContaining('/api/auth/sso/OIDC/8/callback'));
  view.rerender(<Setup saml id={8} />);
  copy();
  expect(state.success).toHaveBeenLastCalledWith(expect.stringContaining('/api/auth/sso/SAML/8/callback*'));
  expect(screen.queryByText('authentikRedirectRegex')).toBeNull();
});
