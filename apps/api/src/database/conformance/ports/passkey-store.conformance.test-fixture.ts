import type { PasskeyStore } from '../../../users-and-auth/auth/passkey/passkey.port';
import type { PortBackendFixture, PortDatabase } from './port-fixture';

/**
 * The PasskeyStore challenge contract across independent connections: a stored challenge is handed out at most once,
 * however many instances try to consume it, and it comes back as neutral values. One database serves the suite;
 * every test uses its own challenge strings.
 */
export function describePasskeyStoreConformance(fixture: PortBackendFixture): void {
  describe(`PasskeyStore conformance on ${fixture.name}`, () => {
    let db: PortDatabase;
    let storeA: PasskeyStore;
    let storeB: PasskeyStore;

    beforeAll(async () => {
      db = await fixture.create();
      storeA = (await db.connect()).passkeys;
      storeB = (await db.connect()).passkeys;
    }, 120_000);

    afterAll(async () => {
      await db.close();
    });

    describe('challenge consumption', () => {
      it('hands a stored challenge to exactly one of many concurrent consumers on independent connections', async () => {
        await storeA.issueChallenge({ challenge: 'c-1', userId: null, expiresAt: new Date(Date.now() + 60_000) });

        const results = await Promise.all(
          Array.from({ length: 8 }, (_, index) => (index % 2 ? storeA : storeB).consumeChallenge('c-1')),
        );

        expect(results.filter((result) => result !== null)).toHaveLength(1);
        expect(await storeA.consumeChallenge('c-1')).toBeNull();
      });

      it('returns the stored challenge with its owner and expiry as neutral values', async () => {
        const { userId } = await db.seedMember('passkey-owner');
        const expiresAt = new Date(Date.now() + 60_000);
        await storeA.issueChallenge({ challenge: 'c-2', userId, expiresAt });

        const consumed = await storeB.consumeChallenge('c-2');

        expect(consumed).toEqual({ challenge: 'c-2', userId, expiresAt });
        expect(consumed?.expiresAt).toBeInstanceOf(Date);
      });

      it('burns an expired challenge too, and reports it with a past expiry for the caller to refuse', async () => {
        await storeA.issueChallenge({ challenge: 'c-3', userId: null, expiresAt: new Date(Date.now() - 1000) });

        const consumed = await storeB.consumeChallenge('c-3');

        expect(consumed?.expiresAt.getTime()).toBeLessThan(Date.now());
        expect(await storeA.consumeChallenge('c-3')).toBeNull();
      });

      it('answers null for a challenge that was never issued', async () => {
        expect(await storeA.consumeChallenge('unknown')).toBeNull();
      });
    });
  });
}
