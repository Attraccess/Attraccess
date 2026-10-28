import axios from 'axios';
import { SSOProvider, SSOProviderType, SsoSessionContext } from '@attraccess/database-entities';
import { OidcSessionResyncer } from './oidc-session-resyncer';
import { SessionRejectedError } from '../session-permission-sync';
import { SSOService } from '../sso.service';
import { RbacService } from '../../../rbac/rbac.service';
import { OidcTokenVerifier } from './oidc-token-verifier.service';
import { EncryptionService } from '../../../../encryption/encryption.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const now = new Date('2026-10-27T12:00:00Z').getTime();
const HOUR = 3600_000;

const provider = {
  id: 4,
  name: 'Keycloak',
  type: SSOProviderType.OIDC,
  oidcConfiguration: {
    ssoProviderId: 4,
    issuer: 'https://idp.example/realms/fab',
    authorizationURL: 'https://idp.example/auth',
    tokenURL: 'https://idp.example/token',
    userInfoURL: 'https://idp.example/userinfo',
    clientId: 'attraccess',
    clientSecret: 'client-secret',
    roleMappings: { 'resource-manager': ['fab-staff'] },
    permissionSyncTtlMinutes: 60,
  },
} as unknown as SSOProvider;

const context = (lastSsoSyncAt = now - 2 * HOUR): SsoSessionContext => ({
  protocol: 'OIDC',
  providerId: 4,
  issuer: 'https://idp.example/realms/fab',
  subject: 'person',
  idTokenEncrypted: 'enc:old-id-token',
  refreshTokenEncrypted: 'enc:old-refresh',
  lastSsoSyncAt,
});

describe('OidcSessionResyncer', () => {
  let ssoService: jest.Mocked<Pick<SSOService, 'getProviderByTypeAndIdWithConfiguration'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'syncSsoRoles'>>;
  let verifier: jest.Mocked<Pick<OidcTokenVerifier, 'verify'>>;
  let patchContext: jest.Mock;
  let resyncer: OidcSessionResyncer;

  const tokenResponse = (status: number, data: Record<string, unknown>) =>
    mockedAxios.post.mockResolvedValue({ status, data });
  const userInfoResponse = (data: Record<string, unknown>) => mockedAxios.get.mockResolvedValue({ status: 200, data });
  const resync = () => resyncer.resync({ context: context(), userId: 7, provider, patchContext });

  beforeEach(() => {
    jest.clearAllMocks();
    ssoService = { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) };
    rbacService = { syncSsoRoles: jest.fn().mockResolvedValue({ added: [], removed: [], updated: [] }) };
    verifier = { verify: jest.fn().mockResolvedValue({ sub: 'person', groups: ['fab-staff'] }) };
    patchContext = jest.fn().mockResolvedValue(undefined);
    const encryption = {
      encrypt: (value: string) => `enc:${value}`,
      decryptIfEncrypted: (value?: string | null) => value?.replace(/^enc:/, '') ?? null,
    } as unknown as EncryptionService;
    resyncer = new OidcSessionResyncer(
      ssoService as unknown as SSOService,
      rbacService as unknown as RbacService,
      verifier as unknown as OidcTokenVerifier,
      encryption,
    );
    tokenResponse(200, { access_token: 'access', refresh_token: 'new-refresh', id_token: 'new-id-token' });
    userInfoResponse({ sub: 'person', groups: ['fab-staff'] });
  });

  it('loads the OIDC provider with its own interval override', async () => {
    expect(await resyncer.loadProvider(4)).toEqual({ provider, permissionSyncTtlMinutes: 60 });
    expect(ssoService.getProviderByTypeAndIdWithConfiguration).toHaveBeenCalledWith(SSOProviderType.OIDC, 4);

    ssoService.getProviderByTypeAndIdWithConfiguration.mockResolvedValue(null);
    expect(await resyncer.loadProvider(4)).toBeNull();
  });

  it.each([
    ['an OIDC session with a refresh token', context(), true],
    [
      'an OIDC session without a refresh token',
      { ...context(), refreshTokenEncrypted: undefined } as SsoSessionContext,
      false,
    ],
    [
      'a SAML session',
      { protocol: 'SAML', providerId: 4, nameID: 'p', sessionIndexes: [] } as SsoSessionContext,
      false,
    ],
  ])('canResync: %s', (_label, ssoContext, expected) => {
    expect(resyncer.canResync(ssoContext)).toBe(expected);
  });

  it('re-syncs with the login claim mapping and persists the rotated tokens', async () => {
    rbacService.syncSsoRoles.mockResolvedValue({ added: ['resource-manager'], removed: [], updated: [] });

    expect(await resync()).toEqual({ added: ['resource-manager'], removed: [], updated: [] });

    const body = new URLSearchParams(mockedAxios.post.mock.calls[0][1] as string);
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://idp.example/token');
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
      client_id: 'attraccess',
      client_secret: 'client-secret',
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://idp.example/userinfo',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access' }) }),
    );
    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
      7,
      [{ roleKey: 'resource-manager', externalValue: 'fab-staff' }],
      SSOProviderType.OIDC,
      4,
    );
    expect(patchContext.mock.calls).toEqual([
      [{ refreshTokenEncrypted: 'enc:new-refresh' }],
      [{ idTokenEncrypted: 'enc:new-id-token' }],
    ]);
    // The rotated refresh token is written before UserInfo is called.
    expect(patchContext.mock.invocationCallOrder[0]).toBeLessThan(mockedAxios.get.mock.invocationCallOrder[0]);
  });

  it('keeps existing roles when the IdP omits every role/group claim', async () => {
    tokenResponse(200, { access_token: 'access' });
    userInfoResponse({ sub: 'person' });

    expect(await resync()).toEqual({ added: [], removed: [], updated: [] });
    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    expect(patchContext).not.toHaveBeenCalled();
  });

  it('rejects the session when the IdP rejects the refresh token', async () => {
    tokenResponse(400, { error: 'invalid_grant', error_description: 'Session not active' });
    await expect(resync()).rejects.toBeInstanceOf(SessionRejectedError);
    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
  });

  it('rejects the session when the IdP answers for a different subject', async () => {
    userInfoResponse({ sub: 'someone-else', groups: ['fab-staff'] });
    await expect(resync()).rejects.toBeInstanceOf(SessionRejectedError);
  });

  it('rejects the session when the refreshed ID token is a logout token', async () => {
    verifier.verify.mockResolvedValue({ sub: 'person', events: {} });
    await expect(resync()).rejects.toBeInstanceOf(SessionRejectedError);
  });

  it.each([
    ['a network error', () => mockedAxios.post.mockRejectedValue(new Error('ECONNRESET'))],
    ['an IdP server error', () => tokenResponse(503, {})],
    ['a misconfigured client', () => tokenResponse(401, { error: 'invalid_client' })],
  ])('throws a plain error on %s so the caller retries', async (_label, arrange) => {
    arrange();
    const error = await resync().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SessionRejectedError);
  });

  it('keeps a rotated refresh token when UserInfo fails right after the token call', async () => {
    mockedAxios.get.mockResolvedValue({ status: 503, data: {} });
    await expect(resync()).rejects.toThrow('Userinfo endpoint returned HTTP 503');
    expect(patchContext).toHaveBeenCalledWith({ refreshTokenEncrypted: 'enc:new-refresh' });
  });
});
