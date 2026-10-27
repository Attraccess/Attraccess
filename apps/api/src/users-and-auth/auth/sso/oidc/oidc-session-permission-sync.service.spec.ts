import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SSOProvider, SSOProviderType, SsoSessionContext } from '@attraccess/database-entities';
import { OidcSessionPermissionSyncService } from './oidc-session-permission-sync.service';
import { SessionService } from '../../session.service';
import { SSOService } from '../sso.service';
import { RbacService } from '../../../rbac/rbac.service';
import { OidcTokenVerifier } from './oidc-token-verifier.service';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { LogoutSession } from '../../session-store/session-store';

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

describe('OidcSessionPermissionSyncService', () => {
  let sessionService: jest.Mocked<Pick<SessionService, 'compareAndSetSsoContext' | 'revokeLogoutSession'>>;
  let ssoService: jest.Mocked<Pick<SSOService, 'getProviderByTypeAndIdWithConfiguration'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'syncSsoRoles'>>;
  let verifier: jest.Mocked<Pick<OidcTokenVerifier, 'verify'>>;
  let audit: jest.Mocked<Pick<SsoAuditService, 'record'>>;
  let metrics: { authSsoPermissionResyncTotal: { inc: jest.Mock } };
  let globalTtlMinutes: number;
  let service: OidcSessionPermissionSyncService;

  const session = (ssoContext: SsoSessionContext | null = context()): LogoutSession => ({ id: '11', ssoContext });
  const tokenResponse = (status: number, data: Record<string, unknown>) =>
    mockedAxios.post.mockResolvedValue({ status, data });
  const userInfoResponse = (data: Record<string, unknown>) => mockedAxios.get.mockResolvedValue({ status: 200, data });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    globalTtlMinutes = 0;
    sessionService = {
      compareAndSetSsoContext: jest.fn().mockResolvedValue(true),
      revokeLogoutSession: jest.fn().mockResolvedValue(undefined),
    };
    ssoService = { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) };
    rbacService = { syncSsoRoles: jest.fn().mockResolvedValue({ added: [], removed: [], updated: [] }) };
    verifier = { verify: jest.fn().mockResolvedValue({ sub: 'person', groups: ['fab-staff'] }) };
    audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    metrics = { authSsoPermissionResyncTotal: { inc: jest.fn() } };
    const encryption = {
      encrypt: (value: string) => `enc:${value}`,
      decryptIfEncrypted: (value?: string | null) => value?.replace(/^enc:/, '') ?? null,
    } as unknown as EncryptionService;
    const config = {
      get: () => ({ SSO_PERMISSION_SYNC_TTL_MINUTES: globalTtlMinutes }),
    } as unknown as ConfigService;
    service = new OidcSessionPermissionSyncService(
      sessionService as unknown as SessionService,
      ssoService as unknown as SSOService,
      rbacService as unknown as RbacService,
      verifier as unknown as OidcTokenVerifier,
      encryption,
      config,
      metrics as unknown as MetricsService,
      audit as unknown as SsoAuditService,
    );
    tokenResponse(200, { access_token: 'access', refresh_token: 'new-refresh', id_token: 'new-id-token' });
    userInfoResponse({ sub: 'person', groups: ['fab-staff'] });
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['a local session', null],
    ['a SAML session', { protocol: 'SAML', providerId: 4, nameID: 'person', sessionIndexes: [] } as SsoSessionContext],
    ['an OIDC session without a refresh token', { ...context(), refreshTokenEncrypted: undefined }],
    ['an OIDC session synced within the interval', context(now - 30 * 60_000)],
  ])('skips %s without contacting the IdP', async (_label, ssoContext) => {
    expect(await service.syncIfDue(session(ssoContext), 7)).toBe('skipped');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(sessionService.compareAndSetSsoContext).not.toHaveBeenCalled();
  });

  it('treats a 0 interval as disabled and inherits the global default when the provider has none', async () => {
    ssoService.getProviderByTypeAndIdWithConfiguration.mockResolvedValue({
      ...provider,
      oidcConfiguration: { ...provider.oidcConfiguration, permissionSyncTtlMinutes: null },
    } as SSOProvider);
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');

    globalTtlMinutes = 90;
    expect(await service.syncIfDue(session(), 7)).toBe('unchanged');
    expect(await service.syncIfDue(session(context(now - 60 * 60_000)), 7)).toBe('skipped');
  });

  it('re-syncs with the login claim mapping and persists the rotated tokens', async () => {
    rbacService.syncSsoRoles.mockResolvedValue({ added: ['resource-manager'], removed: [], updated: [] });
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('updated');

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
    const calls = sessionService.compareAndSetSsoContext.mock.calls;
    expect(calls[0]).toEqual(['11', context(), { ...context(), lastSsoSyncAt: now }]);
    // The rotated refresh token is written before UserInfo is called.
    expect(calls[1][2]).toEqual({ ...context(), lastSsoSyncAt: now, refreshTokenEncrypted: 'enc:new-refresh' });
    expect(sessionService.compareAndSetSsoContext.mock.invocationCallOrder[1]).toBeLessThan(
      mockedAxios.get.mock.invocationCallOrder[0],
    );
    const tokenCall = calls[2];
    expect(tokenCall[2]).toEqual({
      ...context(),
      lastSsoSyncAt: now,
      refreshTokenEncrypted: 'enc:new-refresh',
      idTokenEncrypted: 'enc:new-id-token',
    });
    expect(current.ssoContext).toEqual(tokenCall[2]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso.provisioning.permissions_synced',
        actorId: null,
        subject: { type: 'user', id: 7 },
        details: expect.objectContaining({
          changes: JSON.stringify({ added: ['resource-manager'], removed: [], updated: [] }),
        }),
      }),
    );
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'updated',
    });
  });

  it('records no audit event when the IdP state has no permission delta', async () => {
    expect(await service.syncIfDue(session(), 7)).toBe('unchanged');
    expect(audit.record).not.toHaveBeenCalled();
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'unchanged',
    });
  });

  it('keeps existing roles when the IdP omits every role/group claim', async () => {
    tokenResponse(200, { access_token: 'access' });
    userInfoResponse({ sub: 'person' });

    expect(await service.syncIfDue(session(), 7)).toBe('unchanged');
    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    // No rotated tokens means no second context write.
    expect(sessionService.compareAndSetSsoContext).toHaveBeenCalledTimes(1);
  });

  it('does nothing when another request already claimed the re-sync', async () => {
    sessionService.compareAndSetSsoContext.mockResolvedValue(false);
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('revokes the session when the IdP rejects the refresh token', async () => {
    tokenResponse(400, { error: 'invalid_grant', error_description: 'Session not active' });

    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('11');
    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso.provisioning.sessions_revoked',
        details: expect.objectContaining({ changes: JSON.stringify({ sessionsRevoked: true }) }),
      }),
    );
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'revoked',
    });
  });

  it('revokes the session when the IdP answers for a different subject', async () => {
    userInfoResponse({ sub: 'someone-else', groups: ['fab-staff'] });
    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('11');
  });

  it.each([
    ['a network error', () => mockedAxios.post.mockRejectedValue(new Error('ECONNRESET'))],
    ['an IdP server error', () => tokenResponse(503, {})],
    ['a misconfigured client', () => tokenResponse(401, { error: 'invalid_client' })],
  ])('keeps the session and retries after a short backoff on %s', async (_label, arrange) => {
    arrange();
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('failed');
    expect(sessionService.revokeLogoutSession).not.toHaveBeenCalled();
    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    // Due again one minute later instead of after the full interval.
    expect(current.ssoContext).toEqual({ ...context(), lastSsoSyncAt: now, ssoSyncRetryAt: now + 60_000 });
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({ provider_type: 'oidc', outcome: 'failed' });
  });

  it('still rejects the request when removing an IdP-rejected session fails', async () => {
    tokenResponse(400, { error: 'invalid_grant' });
    sessionService.revokeLogoutSession.mockRejectedValue(new Error('database is locked'));
    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
  });

  it('keeps a rotated refresh token when role sync fails afterwards', async () => {
    rbacService.syncSsoRoles.mockRejectedValue(new Error('database is locked'));
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('failed');
    expect(current.ssoContext).toEqual({
      ...context(),
      refreshTokenEncrypted: 'enc:new-refresh',
      idTokenEncrypted: 'enc:new-id-token',
      lastSsoSyncAt: now,
      ssoSyncRetryAt: now + 60_000,
    });
  });

  it('keeps a rotated refresh token when UserInfo fails right after the token call', async () => {
    mockedAxios.get.mockResolvedValue({ status: 503, data: {} });
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('failed');
    expect(current.ssoContext).toEqual({
      ...context(),
      refreshTokenEncrypted: 'enc:new-refresh',
      lastSsoSyncAt: now,
      ssoSyncRetryAt: now + 60_000,
    });
  });

  it('applies the failure backoff to session refresh as well', async () => {
    const backingOff = { ...context(now - 2 * 60_000), ssoSyncRetryAt: now + 30_000 } as SsoSessionContext;
    expect(await service.syncIfDue(session(backingOff), 7, { force: true })).toBe('skipped');
    expect(await service.syncIfDue(session(backingOff), 7)).toBe('skipped');

    jest.setSystemTime(now + 30_000);
    expect(await service.syncIfDue(session(backingOff), 7, { force: true })).toBe('unchanged');
  });

  it('revokes the session when the refreshed ID token is a logout token', async () => {
    verifier.verify.mockResolvedValue({ sub: 'person', events: {} });
    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
  });

  it('re-syncs on session refresh before the interval elapses, at most once per minute', async () => {
    expect(await service.syncIfDue(session(context(now - 30_000)), 7, { force: true })).toBe('skipped');
    expect(await service.syncIfDue(session(context(now - 5 * 60_000)), 7, { force: true })).toBe('unchanged');
  });

  it('never throws when the provider lookup fails', async () => {
    ssoService.getProviderByTypeAndIdWithConfiguration.mockRejectedValue(new Error('database is locked'));
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');
  });
});
