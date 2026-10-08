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
