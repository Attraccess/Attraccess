import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SSOProvider, SSOProviderType, SsoSessionContext } from '@attraccess/database-entities';
import { SsoSessionPermissionSyncService } from './session-permission-sync.service';
import { SessionPermissionResyncer, SessionRejectedError } from './session-permission-sync';
import { SessionService } from '../session.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { LogoutSession } from '../session-store/session-store';

const now = new Date('2026-10-27T12:00:00Z').getTime();
const HOUR = 3600_000;

const provider = { id: 4, name: 'Keycloak', type: SSOProviderType.OIDC } as unknown as SSOProvider;

const context = (lastSsoSyncAt = now - 2 * HOUR): SsoSessionContext => ({
  protocol: 'OIDC',
  providerId: 4,
  issuer: 'https://idp.example/realms/fab',
  subject: 'person',
  refreshTokenEncrypted: 'enc:old-refresh',
  lastSsoSyncAt,
});

const noDelta = { added: [], removed: [], updated: [] };

describe('SsoSessionPermissionSyncService', () => {
  let sessionService: jest.Mocked<Pick<SessionService, 'compareAndSetSsoContext' | 'revokeLogoutSession'>>;
  let resyncer: jest.Mocked<SessionPermissionResyncer>;
  let audit: jest.Mocked<Pick<SsoAuditService, 'record'>>;
  let metrics: { authSsoPermissionResyncTotal: { inc: jest.Mock } };
  let globalTtlMinutes: number;
  let providerTtl: number | null;
  let service: SsoSessionPermissionSyncService;

  const session = (ssoContext: SsoSessionContext | null = context()): LogoutSession => ({ id: '11', ssoContext });
  const build = (resyncers: SessionPermissionResyncer[]) =>
    new SsoSessionPermissionSyncService(
      sessionService as unknown as SessionService,
      { get: () => ({ SSO_PERMISSION_SYNC_TTL_MINUTES: globalTtlMinutes }) } as unknown as ConfigService,
      metrics as unknown as MetricsService,
      resyncers,
      audit as unknown as SsoAuditService,
    );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    globalTtlMinutes = 0;
    providerTtl = 60;
    sessionService = {
      compareAndSetSsoContext: jest.fn().mockResolvedValue(true),
      revokeLogoutSession: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    metrics = { authSsoPermissionResyncTotal: { inc: jest.fn() } };
    resyncer = {
      protocol: 'OIDC',
      loadProvider: jest.fn().mockImplementation(async () => ({ provider, permissionSyncTtlMinutes: providerTtl })),
      canResync: jest.fn().mockImplementation((ctx: SsoSessionContext) => ctx.protocol === 'OIDC'),
      resync: jest.fn().mockResolvedValue(noDelta),
    };
    service = build([resyncer]);
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['a local session', null],
    [
      'a SAML session without a registered worker',
      { protocol: 'SAML', providerId: 4, nameID: 'p', sessionIndexes: [] } as SsoSessionContext,
    ],
    ['a session the worker cannot re-sync', context()],
    ['a session synced within the interval', context(now - 30 * 60_000)],
  ])('skips %s without contacting the IdP', async (label, ssoContext) => {
    if (label === 'a session the worker cannot re-sync') resyncer.canResync.mockReturnValue(false);
    expect(await service.syncIfDue(session(ssoContext), 7)).toBe('skipped');
    expect(resyncer.resync).not.toHaveBeenCalled();
    expect(sessionService.compareAndSetSsoContext).not.toHaveBeenCalled();
    expect(metrics.authSsoPermissionResyncTotal.inc).not.toHaveBeenCalled();
  });

  it('picks the worker by the session protocol', async () => {
    const saml: jest.Mocked<SessionPermissionResyncer> = {
      protocol: 'SAML',
      loadProvider: jest.fn().mockResolvedValue({ provider, permissionSyncTtlMinutes: 60 }),
      canResync: jest.fn().mockReturnValue(true),
      resync: jest.fn().mockResolvedValue(noDelta),
    };
    service = build([resyncer, saml]);
    const samlContext = {
      protocol: 'SAML',
      providerId: 4,
      nameID: 'p',
      sessionIndexes: [],
      lastSsoSyncAt: 0,
    } as SsoSessionContext;

    expect(await service.syncIfDue(session(samlContext), 7)).toBe('unchanged');

    expect(saml.resync).toHaveBeenCalledTimes(1);
    expect(resyncer.resync).not.toHaveBeenCalled();
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'saml',
      outcome: 'unchanged',
    });
  });

  it('treats a 0 interval as disabled and inherits the global default when the provider has none', async () => {
    providerTtl = null;
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');

    globalTtlMinutes = 90;
    expect(await service.syncIfDue(session(), 7)).toBe('unchanged');
    expect(await service.syncIfDue(session(context(now - 60 * 60_000)), 7)).toBe('skipped');
  });

  it('skips when the provider can no longer be loaded', async () => {
    resyncer.loadProvider.mockResolvedValue(null);
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');
    expect(resyncer.resync).not.toHaveBeenCalled();
  });

  it('claims the attempt, re-syncs, audits and meters a role change', async () => {
    const delta = { added: ['resource-manager'], removed: [], updated: [] };
    resyncer.resync.mockResolvedValue(delta);
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('updated');

    expect(sessionService.compareAndSetSsoContext).toHaveBeenCalledWith('11', context(), {
      ...context(),
      lastSsoSyncAt: now,
    });
    expect(resyncer.resync).toHaveBeenCalledWith(
      expect.objectContaining({ context: { ...context(), lastSsoSyncAt: now }, userId: 7, provider }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso.provisioning.permissions_synced',
        actorId: null,
        subject: { type: 'user', id: 7 },
        details: expect.objectContaining({ changes: JSON.stringify(delta) }),
      }),
    );
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'updated',
    });
  });

  it('records no audit event without a permission delta', async () => {
    expect(await service.syncIfDue(session(), 7)).toBe('unchanged');
    expect(audit.record).not.toHaveBeenCalled();
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'unchanged',
    });
  });

  it('persists context patches from the worker and mirrors them on the session', async () => {
    resyncer.resync.mockImplementation(async ({ patchContext }) => {
      await patchContext({ refreshTokenEncrypted: 'enc:new-refresh' } as Partial<SsoSessionContext>);
      return noDelta;
    });
    const current = session();

    await service.syncIfDue(current, 7);

    const expected = { ...context(), lastSsoSyncAt: now, refreshTokenEncrypted: 'enc:new-refresh' };
    expect(sessionService.compareAndSetSsoContext).toHaveBeenLastCalledWith(
      '11',
      { ...context(), lastSsoSyncAt: now },
      expected,
    );
    expect(current.ssoContext).toEqual(expected);
  });

  it('warns when a context patch loses its compare-and-set', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    resyncer.resync.mockImplementation(async ({ patchContext }) => {
      sessionService.compareAndSetSsoContext.mockResolvedValue(false);
      await patchContext({ refreshTokenEncrypted: 'enc:new-refresh' } as Partial<SsoSessionContext>);
      return noDelta;
    });
    const current = session();

    await service.syncIfDue(current, 7);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lost its compare-and-set'));
    expect(current.ssoContext).toEqual({ ...context(), lastSsoSyncAt: now });
    warn.mockRestore();
  });

  it('does nothing but count it when another request already claimed the re-sync', async () => {
    sessionService.compareAndSetSsoContext.mockResolvedValue(false);
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');
    expect(resyncer.resync).not.toHaveBeenCalled();
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      outcome: 'claim_lost',
    });
  });

  it('revokes the session when the worker reports the IdP rejected it', async () => {
    resyncer.resync.mockRejectedValue(new SessionRejectedError('invalid_grant'));

    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('11');
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

  it('still rejects the request when removing an IdP-rejected session fails', async () => {
    resyncer.resync.mockRejectedValue(new SessionRejectedError('invalid_grant'));
    sessionService.revokeLogoutSession.mockRejectedValue(new Error('database is locked'));
    expect(await service.syncIfDue(session(), 7)).toBe('revoked');
  });

  it('keeps the session and retries after a short backoff on a transient failure', async () => {
    resyncer.resync.mockRejectedValue(new Error('ECONNRESET'));
    const current = session();

    expect(await service.syncIfDue(current, 7)).toBe('failed');
    expect(sessionService.revokeLogoutSession).not.toHaveBeenCalled();
    expect(current.ssoContext).toEqual({ ...context(), lastSsoSyncAt: now, ssoSyncRetryAt: now + 60_000 });
    expect(metrics.authSsoPermissionResyncTotal.inc).toHaveBeenCalledWith({ provider_type: 'oidc', outcome: 'failed' });
  });

  it('backs off against the current context, which keeps patches stored before the failure', async () => {
    resyncer.resync.mockImplementation(async ({ patchContext }) => {
      await patchContext({ refreshTokenEncrypted: 'enc:new-refresh' } as Partial<SsoSessionContext>);
      throw new Error('Userinfo endpoint returned HTTP 503');
    });
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

  it('re-syncs on session refresh before the interval elapses, at most once per minute', async () => {
    expect(await service.syncIfDue(session(context(now - 30_000)), 7, { force: true })).toBe('skipped');
    expect(await service.syncIfDue(session(context(now - 5 * 60_000)), 7, { force: true })).toBe('unchanged');
  });

  it('never throws when the provider lookup fails', async () => {
    resyncer.loadProvider.mockRejectedValue(new Error('database is locked'));
    expect(await service.syncIfDue(session(), 7)).toBe('skipped');
  });
});
