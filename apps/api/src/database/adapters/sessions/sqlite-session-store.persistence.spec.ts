import { DataSource } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import type { SsoSessionContext, SsoSessionSelector } from '@attraccess/application-models';
import type { TokenHashService } from '../../../encryption/token-hash.service';
import { isDatabaseBusyError } from '../../persistence-errors';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { SqliteSessionStore } from './sqlite-session-store';

jest.setTimeout(60_000);

const hash = { hashToken: (token: string) => `h:${token}` } as TokenHashService;
const HOUR = 3_600_000;
const inAnHour = () => new Date(Date.now() + HOUR);

const oidcContext = (subject: string): SsoSessionContext => ({
  protocol: 'OIDC',
  providerId: 1,
  issuer: 'https://idp.example',
  subject,
});
const oidcSelector = (subject: string): SsoSessionSelector => ({
  protocol: 'OIDC',
  providerId: 1,
  issuer: 'https://idp.example',
  subject,
});

/**
 * Concurrency guarantees of the SQLite session store across INDEPENDENT connections (separate DataSources on one
 * file), the way two API instances or two requests with their own connections meet in production.
 */
describe('SqliteSessionStore across independent connections', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let second: DataSource;
  let storeA: SqliteSessionStore;
  let storeB: SqliteSessionStore;

  const activeTokens = async (): Promise<string[]> =>
    (await first.getRepository(Session).find()).map((session) => session.token).sort();

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    second = await fixture.open();
    await first.getRepository(User).save({ id: 7, username: 'fixture', email: 'fixture@example.com' });
    storeA = new SqliteSessionStore(first.getRepository(Session), hash);
    storeB = new SqliteSessionStore(second.getRepository(Session), hash);
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(Session).clear();
    await first.query('DELETE FROM sso_logout_state');
  });

  describe('token rotation', () => {
    it('lets exactly one of two racing rotations win and leaves a single live token', async () => {
      await storeA.createSession('h:old', 7, undefined, inAnHour());

      const results = await Promise.all([
        storeA.rotateSession('old', 'h:new-a', inAnHour()),
        storeB.rotateSession('old', 'h:new-b', inAnHour()),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const tokens = await activeTokens();
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toBe(results[0] ? 'h:new-a' : 'h:new-b');
    });

    it('is idempotent: replaying a spent token neither revives nor duplicates the session', async () => {
      await storeA.createSession('h:old', 7, undefined, inAnHour());

      expect(await storeA.rotateSession('old', 'h:next', inAnHour())).toBe(true);
      expect(await storeB.rotateSession('old', 'h:replayed', inAnHour())).toBe(false);
      expect(await activeTokens()).toEqual(['h:next']);
    });

    it('does not rotate an expired session', async () => {
      await storeA.createSession('h:old', 7, undefined, new Date(Date.now() - 1000));
      expect(await storeB.rotateSession('old', 'h:next', inAnHour())).toBe(false);
      expect(await activeTokens()).toEqual(['h:old']);
    });
  });

  describe('logout receipts', () => {
    it('applies a notification exactly once however many instances receive it', async () => {
      await storeA.createSession('h:s1', 7, { ssoContext: oidcContext('person') }, inAnHour());
      await storeA.createSession('h:s2', 7, { ssoContext: oidcContext('person') }, inAnHour());
      const receipt = { key: 'logout-1', expiresAt: Date.now() + HOUR };

      const results = await Promise.all([
        storeA.revokeSsoSessionsOnce(oidcSelector('person'), receipt),
        storeB.revokeSsoSessionsOnce(oidcSelector('person'), receipt),
        storeB.revokeSsoSessionsOnce(oidcSelector('person'), receipt),
      ]);

      expect(results.filter((result) => result.fresh)).toHaveLength(1);
      expect(results.reduce((total, result) => total + result.count, 0)).toBe(2);
      expect(await activeTokens()).toEqual([]);
    });

    it('is idempotent: a redelivery after the sessions are gone changes nothing', async () => {
      await storeA.createSession('h:s1', 7, { ssoContext: oidcContext('person') }, inAnHour());
      const receipt = { key: 'logout-2', expiresAt: Date.now() + HOUR };

      expect(await storeA.revokeSsoSessionsOnce(oidcSelector('person'), receipt)).toEqual({ fresh: true, count: 1 });
      await storeA.createSession('h:s2', 7, { ssoContext: oidcContext('person') }, inAnHour());

      // The receipt is retained, so a replayed notification must not end the newer session.
      expect(await storeB.revokeSsoSessionsOnce(oidcSelector('person'), receipt)).toEqual({ fresh: false, count: 0 });
      expect(await activeTokens()).toEqual(['h:s2']);
    });

    it('keeps no receipt for an unsigned notification that matched nothing', async () => {
      const receipt = { key: 'logout-3', expiresAt: Date.now() + HOUR, requireMatch: true };

      expect(await storeA.revokeSsoSessionsOnce(oidcSelector('nobody'), receipt)).toEqual({ fresh: false, count: 0 });
      expect(await storeB.takeLogoutState('logout-3')).toBeNull();
    });
  });

  describe('SSO revocation racing a login', () => {
    it('never ends in a state where a revoked login survived or a surviving login was counted', async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const subject = `racer-${attempt}`;
        const [revoked] = await Promise.all([
          storeA.revokeSsoSessionsOnce(oidcSelector(subject), { key: `race-${attempt}`, expiresAt: Date.now() + HOUR }),
          storeB.createSession(`h:login-${attempt}`, 7, { ssoContext: oidcContext(subject) }, inAnHour()),
        ]);

        const survivors = await first.getRepository(Session).countBy({ token: `h:login-${attempt}` });
        // The login landed either before the revocation (revoked, counted) or after it (survives, not counted).
        expect(survivors + revoked.count).toBe(1);
        expect(revoked.fresh).toBe(true);
      }
    });
  });

  describe('revocation and logout races', () => {
    it('reports an active session as revoked exactly once across token and handle revocation', async () => {
      await storeA.createSession('h:tok', 7, undefined, inAnHour());
      const handle = (await storeA.getLogoutSession('tok'))?.id as string;

      const results = await Promise.all([storeA.revokeSession('tok'), storeB.revokeLogoutSession(handle)]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await activeTokens()).toEqual([]);
    });

    it('counts every session exactly once when "sign out everywhere" races single revocations', async () => {
      for (const name of ['a', 'b', 'c', 'd']) await storeA.createSession(`h:${name}`, 7, undefined, inAnHour());

      const [all, ...singles] = await Promise.all([
        storeA.revokeAllUserSessions(7),
        storeB.revokeSession('a'),
        storeB.revokeSession('b'),
      ]);

      expect(all + singles.filter(Boolean).length).toBe(4);
      expect(await activeTokens()).toEqual([]);
    });

    it('does not count an already expired session as active when revoking it', async () => {
      await storeA.createSession('h:old', 7, undefined, new Date(Date.now() - 1000));
      expect(await storeB.revokeSession('old')).toBe(false);
    });
  });

  describe('a busy database', () => {
    it('surfaces SQLITE_BUSY as the neutral busy category and recovers when the writer is done', async () => {
      await storeA.createSession('h:busy', 7, undefined, inAnHour());
      const impatient = new SqliteSessionStore((await fixture.open(false, 100)).getRepository(Session), hash);

      const writer = first.createQueryRunner();
      await writer.connect();
      await writer.startTransaction();
      await writer.query('DELETE FROM sso_logout_state');
      let failure: unknown;
      try {
        await impatient.revokeSession('busy').catch((error) => {
          failure = error;
        });
      } finally {
        await writer.rollbackTransaction();
        await writer.release();
      }

      expect(isDatabaseBusyError(failure)).toBe(true);
      expect(await activeTokens()).toEqual(['h:busy']);
      expect(await impatient.revokeSession('busy')).toBe(true);
    });
  });
});
