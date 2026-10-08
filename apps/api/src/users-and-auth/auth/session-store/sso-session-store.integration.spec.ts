import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeResourceTransactionConnection } from '../../../database/run-serialized-transaction';
import { DataSource, Repository } from 'typeorm';
import { Session, SsoSessionContext, User, entities } from '@attraccess/database-entities';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import { instanceToPlain } from 'class-transformer';
import { SessionStore } from './session-store';
import { SessionStrategy } from '../../strategies/session.strategy';
import { TwoFactorService } from '../two-factor.service';
import { RbacService } from '../../rbac/rbac.service';
import { ApiTokenService } from '../api-token/api-token.service';
import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { Request } from 'express';
import { AuthController } from '../auth.controller';
import { SessionService } from '../session.service';
import { SsoLogoutService } from '../sso/sso-logout.service';
import { SettingsService } from '../../../settings/settings.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Response } from 'express';
import { MetricsService } from '../../../metrics/metrics.service';
import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';
import { SqliteSessionStore } from './sqlite.session-store';
import { ValkeySessionStore } from './valkey.session-store';
import { TokenHashService } from '../../../encryption/token-hash.service';

jest.setTimeout(90000);
const hash = { hashToken: (token: string) => `hashed:${token}` } as TokenHashService;
const oidc: SsoSessionContext = {
  protocol: 'OIDC',
  providerId: 1,
  issuer: 'https://idp.example',
  subject: 'person',
  sid: 'browser',
  idTokenEncrypted: 'encrypted-fixture',
};
const saml: SsoSessionContext = {
  protocol: 'SAML',
  providerId: 2,
  issuer: 'idp',
  nameID: 'person',
  nameIDFormat: 'format',
  nameQualifier: 'idp',
  spNameQualifier: 'sp',
  sessionIndexes: ['first', 'second'],
};

for (const backend of ['SQLite', 'Valkey'] as const) {
  describe(`${backend} SSO session persistence`, () => {
    let store: SessionStore;
    let directory: string;
    let source: DataSource;
    let client: Redis;
    let container: StartedTestContainer;
    beforeAll(async () => {
      if (backend === 'SQLite') {
        directory = mkdtempSync(join(tmpdir(), 'attraccess-session-'));
        source = await new DataSource({
          type: 'sqlite',
          database: join(directory, 'sessions.sqlite'),
          busyTimeout: 5000,
          entities: Object.values(entities),
          synchronize: true,
        }).initialize();
        await source
          .getRepository(User)
          .save({ id: 7, username: 'fixture', email: 'fixture@example.com', isEmailVerified: true });
        await source.query(
          'CREATE TABLE sso_logout_state (key text PRIMARY KEY, value text NOT NULL, expiresAt integer NOT NULL)',
        );
        store = new SqliteSessionStore(source.getRepository(Session), hash);
      } else {
        container = await new GenericContainer('valkey/valkey:8-alpine').withExposedPorts(6379).start();
        client = new Redis(container.getMappedPort(6379), container.getHost());
        const users = {
          findOne: async () => ({ id: 7, username: 'fixture', email: 'fixture@example.com', isEmailVerified: true }),
        } as unknown as Repository<User>;
        store = new ValkeySessionStore(client, users, hash);
      }
    });
    afterAll(async () => {
      if (source?.isInitialized) {
        await closeResourceTransactionConnection(source);
        await source.destroy();
      }
      if (directory) rmSync(directory, { recursive: true, force: true });
      if (client) await client.quit();
      if (container) await container.stop();
    });
    beforeEach(async () => {
      if (client) await client.flushdb();
      if (source) {
        await source.getRepository(Session).clear();
        await source.query('DELETE FROM sso_logout_state');
      }
    });
    const create = async (token: string, context?: SsoSessionContext, expires = Date.now() + 60000) =>
      store.createSession(hash.hashToken(token), 7, { ssoContext: context }, new Date(expires));

    it('preserves context through refresh and revokes only the provider/session intersection', async () => {
      await create('matched', oidc);
      await create('other-session', { ...oidc, sid: 'other' });
      await create('other-subject', { ...oidc, subject: 'other' });
      await create('other-provider', { ...oidc, providerId: 3 });
      await create('local');
      expect(await store.rotateSession('matched', hash.hashToken('rotated'), new Date(Date.now() + 60000))).toBe(true);
      expect(await store.getSsoContext('rotated')).toEqual(oidc);
      expect(await store.getSsoContext('matched')).toBeNull();
      expect(
        await store.revokeSsoSessions({
          protocol: 'OIDC',
          providerId: 1,
          issuer: oidc.issuer,
          subject: oidc.subject,
          sid: oidc.sid,
        }),
      ).toBe(1);
      expect(await store.validateSession('rotated')).toBeNull();
      for (const token of ['other-session', 'other-subject', 'other-provider', 'local'])
        expect(await store.validateSession(token)).not.toBeNull();
      expect(
        await store.revokeSsoSessions({ protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, sid: oidc.sid }),
      ).toBe(1);
      expect(
        await store.revokeSsoSessions({ protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, subject: oidc.subject }),
      ).toBe(1);
      expect(
        await store.revokeSsoSessions({
          protocol: 'OIDC',
          providerId: 1,
          issuer: 'https://wrong.example',
          subject: oidc.subject,
        }),
      ).toBe(0);
    });

    it('matches the complete SAML identity and any supplied SessionIndex', async () => {
      await create('matched', saml);
      await create('other-index', { ...saml, sessionIndexes: ['third'] });
      await create('other-qualifier', { ...saml, spNameQualifier: 'other-sp' });
      await create('other-format', { ...saml, nameIDFormat: 'other-format' });
      const selector = { ...saml, sessionIndexes: ['absent', 'second'] };
      expect(await store.revokeSsoSessions(selector)).toBe(1);
      expect(await store.revokeSsoSessions({ ...saml, sessionIndexes: [] })).toBe(1);
      for (const token of ['other-qualifier', 'other-format'])
        expect(await store.validateSession(token)).not.toBeNull();
    });

    it('never resurrects a session when refresh races with provider revocation', async () => {
      for (let i = 0; i < 20; i++) {
        await create(`old-${i}`, oidc);
        const [, count] = await Promise.all([
          store.rotateSession(`old-${i}`, hash.hashToken(`new-${i}`), new Date(Date.now() + 60000)),
          store.revokeSsoSessions({ protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, sid: oidc.sid }),
        ]);
        expect(count).toBe(1);
        expect(await store.validateSession(`old-${i}`)).toBeNull();
        expect(await store.validateSession(`new-${i}`)).toBeNull();
        expect(await store.rotateSession(`new-${i}`, 'cannot-revive', new Date(Date.now() + 60000))).toBe(false);
      }
    });

    it.each([false, true])(
      'central logout ends a session refreshed during provider preparation (failure: %s)',
      async (failure) => {
        await create('original', oidc);
        await create('independent', oidc);
        const dec = jest.fn();
        const sessions = new SessionService(
          store,
          hash,
          { authActiveSessions: { dec } } as unknown as MetricsService,
          {} as CronTimer,
        );
        let started: () => void;
        const preparing = new Promise<void>((resolve) => {
          started = resolve;
        });
        let proceed: () => void;
        const paused = new Promise<void>((resolve) => {
          proceed = resolve;
        });
        const controller = new AuthController(
          sessions,
          {
            getCookieName: () => 'auth-session',
            clearAuthCookie: async () => undefined,
          } as unknown as CookieConfigService,
          undefined,
          {
            returnURL: async () => 'https://app.example/',
            prepare: async () => {
              started();
              await paused;
              if (failure) throw new Error('Provider unavailable');
              return { kind: 'redirect', redirectUrl: 'https://idp.example/logout' };
            },
          } as unknown as SsoLogoutService,
          { getUrl: async () => 'https://app.example' } as SettingsService,
        );
        const request = {
          user: { id: 7 },
          authSession: (await store.authenticateSession('original')).session,
          headers: { authorization: 'Bearer original', origin: 'https://app.example' },
          cookies: {},
          logout: (done: () => void) => done(),
        } as unknown as AuthenticatedRequest;
        const logout = controller.logoutEverywhere(request, { setHeader: jest.fn() } as unknown as Response);
        await preparing;
        expect(await store.rotateSession('original', hash.hashToken('rotated'), new Date(Date.now() + 60000))).toBe(
          true,
        );
        expect(
          await store.rotateSession('rotated', hash.hashToken('rotated-again'), new Date(Date.now() + 60000)),
        ).toBe(true);
        proceed();
        expect((await logout).kind).toBe(failure ? 'local_only' : 'redirect');
        expect(await store.validateSession('rotated-again')).toBeNull();
        expect(await store.validateSession('independent')).not.toBeNull();
        expect(dec).toHaveBeenCalledTimes(1);
        expect(
          await store.rotateSession('rotated-again', hash.hashToken('revived'), new Date(Date.now() + 60000)),
        ).toBe(false);
      },
    );

    it.each(['local', 'central'])(
      '%s logout revokes the authenticated session even when refresh completes before the handler starts',
      async (kind) => {
        await create('original', oidc);
        await create('independent', oidc);
        const dec = jest.fn();
        const sessions = new SessionService(
          store,
          hash,
          { authActiveSessions: { dec } } as unknown as MetricsService,
          {} as CronTimer,
        );
        let authenticated: () => void;
        const captured = new Promise<void>((resolve) => {
          authenticated = resolve;
        });
        let proceed: () => void;
        const paused = new Promise<void>((resolve) => {
          proceed = resolve;
        });
        const strategy = new SessionStrategy(
          sessions,
          {} as TwoFactorService,
          {
            getEffectivePermissions: async () => {
              authenticated();
              await paused;
              return new Set();
            },
          } as unknown as RbacService,
          { authenticate: async () => null } as unknown as ApiTokenService,
          {} as AuthAuditLogger,
        );
        const request = {
          headers: { authorization: 'Bearer original', origin: 'https://app.example' },
          cookies: {},
          path: '/api/auth/session',
          logout: (done: () => void) => done(),
        } as unknown as AuthenticatedRequest;
        const validating = strategy.validate(request as unknown as Request);
        await captured;
        expect(await store.rotateSession('original', hash.hashToken('rotated'), new Date(Date.now() + 60000))).toBe(
          true,
        );
        proceed();
        request.user = (await validating) as AuthenticatedRequest['user'];
        const controller = new AuthController(
          sessions,
          {
            getCookieName: () => 'auth-session',
            clearAuthCookie: async () => undefined,
          } as unknown as CookieConfigService,
          undefined,
          {
            returnURL: async () => 'https://app.example/',
            prepare: async () => ({ kind: 'local_only' }),
          } as unknown as SsoLogoutService,
          { getUrl: async () => 'https://app.example' } as SettingsService,
        );
        if (kind === 'local') await controller.endSession(request, {} as Response);
        else await controller.logoutEverywhere(request, { setHeader: jest.fn() } as unknown as Response);
        expect(await store.validateSession('original')).toBeNull();
        expect(await store.validateSession('rotated')).toBeNull();
        expect(await store.rotateSession('rotated', hash.hashToken('revived'), new Date(Date.now() + 60000))).toBe(
          false,
        );
        expect(await store.validateSession('independent')).not.toBeNull();
        expect(dec).toHaveBeenCalledTimes(1);
      },
    );

    it('atomically revokes a captured session lineage when refresh races with logout', async () => {
      for (let i = 0; i < 20; i++) {
        await create(`original-${i}`, oidc);
        const session = await store.getLogoutSession(`original-${i}`);
        const [, removed] = await Promise.all([
          store.rotateSession(`original-${i}`, hash.hashToken(`rotated-${i}`), new Date(Date.now() + 60000)),
          store.revokeLogoutSession(session.id),
        ]);
        expect(removed).toBe(true);
        expect(await store.validateSession(`original-${i}`)).toBeNull();
        expect(await store.validateSession(`rotated-${i}`)).toBeNull();
        expect(await store.revokeLogoutSession(session.id)).toBe(false);
      }
    });

    it.each([oidc, saml])(
      'compares provider timestamps for $protocol logout and protects later logins',
      async (context) => {
        const providerNow = Date.now() - 15000;
        await create('before-logout', { ...context, providerIssuedAt: providerNow - 1000 });
        await create('after-logout', { ...context, providerIssuedAt: providerNow + 1000 });
        await create('legacy-timestamp', context);
        expect(
          await store.rotateSession('before-logout', hash.hashToken('refreshed'), new Date(Date.now() + 60000)),
        ).toBe(true);
        const selector = { ...context, issuedBefore: providerNow };
        expect(
          await store.revokeSsoSessionsOnce(selector, { key: 'provider-clock', expiresAt: Date.now() + 60000 }),
        ).toEqual({ fresh: true, count: 2 });
        expect(await store.validateSession('refreshed')).toBeNull();
        expect(await store.validateSession('legacy-timestamp')).toBeNull();
        expect(await store.validateSession('after-logout')).not.toBeNull();
        expect(
          await store.revokeSsoSessionsOnce(selector, { key: 'provider-clock', expiresAt: Date.now() + 60000 }),
        ).toEqual({ fresh: false, count: 0 });
      },
    );

    it('returns actual counts for concurrent duplicate revocations and omits private context from session responses', async () => {
      await create('live', oidc);
      const publicSessions = await store.getUserSessions(7);
      expect(instanceToPlain(publicSessions)[0]).not.toHaveProperty('ssoContext');
      const counts = await Promise.all([store.revokeAllUserSessions(7), store.revokeAllUserSessions(7)]);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
      expect(await store.countActive()).toBe(0);
    });

    it('atomically consumes transactions and keeps replay receipts independent of session deletion', async () => {
      await create('live', oidc);
      expect(await store.putLogoutState('receipt', 'seen', Date.now() + 60000)).toBe(true);
      expect(await store.putLogoutState('receipt', 'seen', Date.now() + 60000)).toBe(false);
      await store.revokeSession('live');
      expect(await store.putLogoutState('receipt', 'seen', Date.now() + 60000)).toBe(false);
      expect(await store.putLogoutState('transaction', 'target', Date.now() + 60000)).toBe(true);
      const results = await Promise.all([store.takeLogoutState('transaction'), store.takeLogoutState('transaction')]);
      expect(results.filter((value) => value === 'target')).toHaveLength(1);
      expect(await store.putLogoutState('expired', 'target', Date.now() - 1000)).toBe(false);
      expect(await store.takeLogoutState('expired')).toBeNull();
    });

    it('atomically records a logout receipt with revocation and protects new sessions from replay', async () => {
      await create('live', oidc);
      const selector = { protocol: 'OIDC' as const, providerId: 1, issuer: oidc.issuer, sid: oidc.sid };
      const receipt = { key: 'atomic-receipt', expiresAt: Date.now() + 60000 };
      expect(
        await store.revokeSsoSessionsOnce(selector, { key: 'expired-receipt', expiresAt: Date.now() - 1 }),
      ).toEqual({ fresh: false, count: 0 });
      expect(await store.validateSession('live')).not.toBeNull();
      const results = await Promise.all([
        store.revokeSsoSessionsOnce(selector, receipt),
        store.revokeSsoSessionsOnce(selector, receipt),
      ]);
      expect(results.filter((result) => result.fresh)).toHaveLength(1);
      expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
      await create('new-login', oidc);
      expect(await store.revokeSsoSessionsOnce(selector, receipt)).toEqual({ fresh: false, count: 0 });
      expect(await store.validateSession('new-login')).not.toBeNull();
    });

    it('allocates unsigned logout receipts only for active matching sessions and preserves replay protection', async () => {
      const selector = { protocol: 'OIDC' as const, providerId: 1, issuer: oidc.issuer, sid: oidc.sid };
      const receipt = { key: 'unsigned-receipt', expiresAt: Date.now() + 60000, requireMatch: true };
      for (let i = 0; i < 25; i++) {
        expect(
          await store.revokeSsoSessionsOnce({ ...selector, sid: `unknown-${i}` }, { ...receipt, key: `unknown-${i}` }),
        ).toEqual({ fresh: false, count: 0 });
      }
      if (client) expect(await client.keys('sso_logout_state:*')).toEqual([]);
      if (source) expect(await source.query('SELECT * FROM sso_logout_state')).toEqual([]);
      await create('matched', oidc);
      await create('unrelated', { ...oidc, sid: 'different' });
      const results = await Promise.all([
        store.revokeSsoSessionsOnce(selector, receipt),
        store.revokeSsoSessionsOnce(selector, receipt),
      ]);
      expect(results.filter((result) => result.fresh)).toHaveLength(1);
      expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
      await create('later-login', oidc);
      expect(await store.revokeSsoSessionsOnce(selector, receipt)).toEqual({ fresh: false, count: 0 });
      expect(await store.validateSession('later-login')).not.toBeNull();
      expect(await store.validateSession('unrelated')).not.toBeNull();
    });

    it('keeps captured logout handles usable for existing Valkey sessions without lineage metadata', async () => {
      if (!client) return;
      await create('legacy');
      await client.hdel(`session:${hash.hashToken('legacy')}`, 'lineageId');
      await client.del(`session_lineage:${hash.hashToken('legacy')}`);
      const session = await store.getLogoutSession('legacy');
      expect(await store.rotateSession('legacy', hash.hashToken('rotated-legacy'), new Date(Date.now() + 60000))).toBe(
        true,
      );
      expect(await store.revokeLogoutSession(session.id)).toBe(true);
      expect(await store.validateSession('rotated-legacy')).toBeNull();
      expect(await client.keys('session_lineage:*')).toEqual([]);
    });

    it('cleans expired lookup members and leaves legacy sessions usable', async () => {
      await create('expired', oidc, Date.now() - 1000);
      await create('legacy');
      await store.cleanupExpired();
      expect(
        await store.revokeSsoSessions({ protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, sid: oidc.sid }),
      ).toBe(0);
      expect(await store.getSsoContext('legacy')).toBeNull();
      expect(await store.rotateSession('legacy', hash.hashToken('legacy-new'), new Date(Date.now() + 60000))).toBe(
        true,
      );
      expect(await store.validateSession('legacy-new')).not.toBeNull();
      if (client) {
        for (const key of await client.keys('sso_sessions:*')) expect(await client.zcard(key)).toBe(0);
      }
    });
  });
}
