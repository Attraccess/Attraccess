import type { SsoSessionContext, SsoSessionSelector } from '@attraccess/application-models';
import type { SessionStore } from '../../../users-and-auth/auth/session-store/session-store';
import type { PortBackendFixture, PortDatabase } from './port-fixture';

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
 * The SessionStore contract across INDEPENDENT connections, the way two API instances or two requests with their own
 * connections meet in production. One database serves the whole suite: every test works on its own user, its own
 * tokens (prefixed with the test's namespace) and its own SSO subject. Stored tokens are `h:<raw token>`.
 */
export function describeSessionStoreConformance(fixture: PortBackendFixture): void {
  describe(`SessionStore conformance on ${fixture.name}`, () => {
    let db: PortDatabase;
    let storeA: SessionStore;
    let storeB: SessionStore;
    let userId: number;
    let ns: string;
    let tests = 0;

    /** A raw token of this test. */
    const raw = (name: string) => `${ns}-${name}`;
    /** The stored form of a raw token of this test. */
    const stored = (name: string) => `h:${raw(name)}`;
    const activeTokens = () => db.sessionTokens(userId);

    beforeAll(async () => {
      db = await fixture.create();
      storeA = (await db.connect()).sessions;
      storeB = (await db.connect()).sessions;
    }, 120_000);

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      ns = `t${++tests}`;
      ({ userId } = await db.seedMember(`session-${ns}`));
    });

    describe('token rotation', () => {
      it('lets exactly one of two racing rotations win and leaves a single live token', async () => {
        await storeA.createSession(stored('old'), userId, undefined, inAnHour());

        const results = await Promise.all([
          storeA.rotateSession(raw('old'), stored('new-a'), inAnHour()),
          storeB.rotateSession(raw('old'), stored('new-b'), inAnHour()),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
        const tokens = await activeTokens();
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toBe(results[0] ? stored('new-a') : stored('new-b'));
      });

      it('is idempotent: replaying a spent token neither revives nor duplicates the session', async () => {
        await storeA.createSession(stored('old'), userId, undefined, inAnHour());

        expect(await storeA.rotateSession(raw('old'), stored('next'), inAnHour())).toBe(true);
        expect(await storeB.rotateSession(raw('old'), stored('replayed'), inAnHour())).toBe(false);
        expect(await activeTokens()).toEqual([stored('next')]);
      });

      it('does not rotate an expired session', async () => {
        await storeA.createSession(stored('old'), userId, undefined, new Date(Date.now() - 1000));
        expect(await storeB.rotateSession(raw('old'), stored('next'), inAnHour())).toBe(false);
        expect(await activeTokens()).toEqual([stored('old')]);
      });
    });

    describe('logout receipts', () => {
      it('applies a notification exactly once however many instances receive it', async () => {
        const person = raw('person');
        await storeA.createSession(stored('s1'), userId, { ssoContext: oidcContext(person) }, inAnHour());
        await storeA.createSession(stored('s2'), userId, { ssoContext: oidcContext(person) }, inAnHour());
        const receipt = { key: raw('logout-1'), expiresAt: Date.now() + HOUR };

        const results = await Promise.all([
          storeA.revokeSsoSessionsOnce(oidcSelector(person), receipt),
          storeB.revokeSsoSessionsOnce(oidcSelector(person), receipt),
          storeB.revokeSsoSessionsOnce(oidcSelector(person), receipt),
        ]);

        expect(results.filter((result) => result.fresh)).toHaveLength(1);
        expect(results.reduce((total, result) => total + result.count, 0)).toBe(2);
        expect(await activeTokens()).toEqual([]);
      });

      it('is idempotent: a redelivery after the sessions are gone changes nothing', async () => {
        const person = raw('person');
        await storeA.createSession(stored('s1'), userId, { ssoContext: oidcContext(person) }, inAnHour());
        const receipt = { key: raw('logout-2'), expiresAt: Date.now() + HOUR };

        expect(await storeA.revokeSsoSessionsOnce(oidcSelector(person), receipt)).toEqual({ fresh: true, count: 1 });
        await storeA.createSession(stored('s2'), userId, { ssoContext: oidcContext(person) }, inAnHour());

        // The receipt is retained, so a replayed notification must not end the newer session.
        expect(await storeB.revokeSsoSessionsOnce(oidcSelector(person), receipt)).toEqual({ fresh: false, count: 0 });
        expect(await activeTokens()).toEqual([stored('s2')]);
      });

      it('keeps no receipt for an unsigned notification that matched nothing', async () => {
        const receipt = { key: raw('logout-3'), expiresAt: Date.now() + HOUR, requireMatch: true };

        expect(await storeA.revokeSsoSessionsOnce(oidcSelector(raw('nobody')), receipt)).toEqual({
          fresh: false,
          count: 0,
        });
        expect(await storeB.takeLogoutState(raw('logout-3'))).toBeNull();
      });
    });

    describe('SSO revocation racing a login', () => {
      it('never ends in a state where a revoked login survived or a surviving login was counted', async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
          const subject = raw(`racer-${attempt}`);
          const [revoked] = await Promise.all([
            storeA.revokeSsoSessionsOnce(oidcSelector(subject), {
              key: raw(`race-${attempt}`),
              expiresAt: Date.now() + HOUR,
            }),
            storeB.createSession(stored(`login-${attempt}`), userId, { ssoContext: oidcContext(subject) }, inAnHour()),
          ]);

          const survivors = (await activeTokens()).filter((token) => token === stored(`login-${attempt}`)).length;
          // The login landed either before the revocation (revoked, counted) or after it (survives, not counted).
          expect(survivors + revoked.count).toBe(1);
          expect(revoked.fresh).toBe(true);
        }
      });
    });

    describe('revocation and logout races', () => {
      it('reports an active session as revoked exactly once across token and handle revocation', async () => {
        await storeA.createSession(stored('tok'), userId, undefined, inAnHour());
        const handle = (await storeA.getLogoutSession(raw('tok')))?.id as string;

        const results = await Promise.all([storeA.revokeSession(raw('tok')), storeB.revokeLogoutSession(handle)]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await activeTokens()).toEqual([]);
      });

      it('counts every session exactly once when "sign out everywhere" races single revocations', async () => {
        for (const name of ['a', 'b', 'c', 'd'])
          await storeA.createSession(stored(name), userId, undefined, inAnHour());

        const [all, ...singles] = await Promise.all([
          storeA.revokeAllUserSessions(userId),
          storeB.revokeSession(raw('a')),
          storeB.revokeSession(raw('b')),
        ]);

        expect(all + singles.filter(Boolean).length).toBe(4);
        expect(await activeTokens()).toEqual([]);
      });

      it('does not count an already expired session as active when revoking it', async () => {
        await storeA.createSession(stored('old'), userId, undefined, new Date(Date.now() - 1000));
        expect(await storeB.revokeSession(raw('old'))).toBe(false);
      });
    });
  });
}
