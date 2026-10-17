import { beforeEach, afterEach, describe, expect, it } from '@jest/globals';
import { ApplicationFixture, ApplicationFixtureFactory, ApplicationClient } from './backend-fixture';

async function overlapSessions<T>(
  a: ApplicationClient,
  b: ApplicationClient,
  left: () => Promise<T>,
  right: () => Promise<T>,
) {
  const ga = a.gateNextSession();
  const gb = b.gateNextSession();
  const results = Promise.all([left(), right()]);
  try {
    await Promise.all([ga.entered, gb.entered]);
  } finally {
    ga.release();
    gb.release();
  }
  return results;
}
/** Both clients enter a session operation before either is released. */
export function sessionConformance(name: string, factory: ApplicationFixtureFactory) {
  describe(`${name}: atomic session updates and one-time receipts`, () => {
    let fixture: ApplicationFixture;
    let a: ApplicationClient;
    let b: ApplicationClient;
    beforeEach(async () => {
      fixture = await factory();
      a = await fixture.client();
      b = await fixture.client();
    });
    afterEach(async () => {
      await fixture?.close();
    });
    it('rotates the old token once, then revokes the winning token once', async () => {
      const expires = new Date(Date.now() + 60_000);
      await a.sessions.createSession(a.hashToken('old'), 1, undefined, expires);
      const rotated = await overlapSessions(
        a,
        b,
        () => a.sessions.rotateSession('old', a.hashToken('new-a'), expires),
        () => b.sessions.rotateSession('old', b.hashToken('new-b'), expires),
      );
      expect(rotated.filter(Boolean)).toHaveLength(1);
      expect(await a.sessions.validateSession('old')).toBeNull();
      const winner = rotated[0] ? 'new-a' : 'new-b';
      expect((await b.sessions.validateSession(winner))?.id).toBe(1);
      expect(
        (
          await overlapSessions(
            a,
            b,
            () => a.sessions.revokeSession(winner),
            () => b.sessions.revokeSession(winner),
          )
        ).filter(Boolean),
      ).toHaveLength(1);
      expect(await a.sessions.validateSession(winner)).toBeNull();
    });
    it('revokes SSO sessions once for two overlapping deliveries of the same signed logout', async () => {
      await a.sessions.createSession(
        a.hashToken('sso'),
        1,
        {
          ssoContext: {
            protocol: 'OIDC',
            providerId: 1,
            issuer: 'https://identity.example.test',
            subject: 'operator',
            sid: 'idp-session',
          },
        },
        new Date(Date.now() + 60_000),
      );
      const selector = {
        protocol: 'OIDC' as const,
        providerId: 1,
        issuer: 'https://identity.example.test',
        subject: 'operator',
      };
      const receipt = { key: 'signed-logout', expiresAt: Date.now() + 60_000 };
      const results = await overlapSessions(
        a,
        b,
        () => a.sessions.revokeSsoSessionsOnce(selector, receipt),
        () => b.sessions.revokeSsoSessionsOnce(selector, receipt),
      );
      expect(results.filter((row) => row.fresh)).toHaveLength(1);
      expect(results.reduce((count, row) => count + row.count, 0)).toBe(1);
      expect(await a.sessions.validateSession('sso')).toBeNull();
      expect(await b.sessions.revokeSsoSessionsOnce(selector, receipt)).toEqual({ fresh: false, count: 0 });
    });
    it('consumes a logout receipt once across independent connections', async () => {
      expect(await a.sessions.putLogoutState('one-time', 'payload', Date.now() + 60_000)).toBe(true);
      expect(await b.sessions.putLogoutState('one-time', 'replacement', Date.now() + 60_000)).toBe(false);
      expect(
        (
          await overlapSessions(
            a,
            b,
            () => a.sessions.takeLogoutState('one-time'),
            () => b.sessions.takeLogoutState('one-time'),
          )
        ).sort(),
      ).toEqual([null, 'payload'].sort());
      expect(await a.sessions.takeLogoutState('one-time')).toBeNull();
    });
  });
}
