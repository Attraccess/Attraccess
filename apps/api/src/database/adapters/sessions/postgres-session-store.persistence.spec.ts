import { DataSource } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import type { SsoSessionContext } from '@attraccess/application-models';
import type { TokenHashService } from '../../../encryption/token-hash.service';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { PostgresSessionStore } from './postgres-session-store';

jest.setTimeout(60_000);

const hash = { hashToken: (token: string) => `h:${token}` } as TokenHashService;
const HOUR = 3_600_000;
const inAnHour = () => new Date(Date.now() + HOUR);

/** PostgreSQL specifics of the session store on a real database, through connections of their own. */
describe('PostgresSessionStore on PostgreSQL', () => {
  let database: PostgresDatabaseFixture;
  let first: DataSource;
  let second: DataSource;
  let storeA: PostgresSessionStore;
  let storeB: PostgresSessionStore;
  let userId: number;

  beforeAll(async () => {
    database = await PostgresDatabaseFixture.create();
    first = await database.open();
    second = await database.open();
    userId = (await first.getRepository(User).save({ username: 'fixture', email: 'fixture@example.com' })).id;
    storeA = new PostgresSessionStore(first.getRepository(Session), hash);
    storeB = new PostgresSessionStore(second.getRepository(Session), hash);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await first.getRepository(Session).clear();
    await first.query('DELETE FROM sso_logout_state');
  });

  it('lists the active sessions of a user by last access, newest first', async () => {
    await storeA.createSession('h:old', userId, undefined, inAnHour());
    await storeA.createSession('h:recent', userId, undefined, inAnHour());
    await storeA.createSession('h:expired', userId, undefined, new Date(Date.now() - HOUR));
    await first.getRepository(Session).update({ token: 'h:old' }, { lastAccessedAt: new Date(Date.now() - HOUR) });
    await first.getRepository(Session).update({ token: 'h:recent' }, { lastAccessedAt: new Date() });

    const sessions = await storeA.getUserSessions(userId);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].lastAccessedAt.getTime()).toBeGreaterThan(sessions[1].lastAccessedAt.getTime());
  });

  it('compares the SSO context by value, whatever the key order of the stored document', async () => {
    const context: SsoSessionContext = { protocol: 'OIDC', providerId: 1, issuer: 'https://idp.example', subject: 's' };
    await storeA.createSession('h:sso', userId, { ssoContext: context }, inAnHour());
    const id = String((await first.getRepository(Session).findOneByOrFail({ token: 'h:sso' })).id);
    const reordered = Object.fromEntries(Object.entries(context).reverse()) as unknown as SsoSessionContext;
    const next = { ...context, sid: 'next' } as SsoSessionContext;

    expect(await storeB.compareAndSetSsoContext(id, reordered, next)).toBe(true);
    expect(await storeA.compareAndSetSsoContext(id, context, next)).toBe(false);
    expect(await storeA.getSsoContext('sso')).toEqual(next);
  });

  it('lets exactly one of two parallel connections consume a logout receipt', async () => {
    await storeA.createSession('h:one', userId, undefined, inAnHour());
    const receipt = { key: 'receipt-1', expiresAt: Date.now() + HOUR, requireMatch: false };
    const selector = { protocol: 'OIDC' as const, providerId: 1, issuer: 'https://idp.example', subject: 'nobody' };

    const results = await Promise.all([storeA, storeB].map((store) => store.revokeSsoSessionsOnce(selector, receipt)));

    expect(results.filter((result) => result.fresh)).toHaveLength(1);
  });

  it('counts parallel increments of an ephemeral counter without losing one', async () => {
    const expiresAt = Date.now() + HOUR;
    const counts = await Promise.all(
      Array.from({ length: 10 }, (_, index) => (index % 2 ? storeA : storeB).incrementEphemeralCounter('c', expiresAt)),
    );

    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rotates a token once when two connections race for it', async () => {
    await storeA.createSession('h:rot', userId, undefined, inAnHour());

    const rotated = await Promise.all([
      storeA.rotateSession('rot', 'h:rot-a', inAnHour()),
      storeB.rotateSession('rot', 'h:rot-b', inAnHour()),
    ]);

    expect(rotated.filter(Boolean)).toHaveLength(1);
  });
});
