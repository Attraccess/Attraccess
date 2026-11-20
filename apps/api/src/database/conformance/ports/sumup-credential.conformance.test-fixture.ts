import type { SumUpCredentialStore } from '../../../billing/ports/sumup-credentials.port';
import type { PortBackendFixture, PortDatabase } from './port-fixture';

/**
 * The SumUpCredentialStore contract across independent connections: saving is an upsert of the two values that
 * neither fails nor duplicates a row when instances save at the same time, and the stored pair is always one save's.
 */
export function describeSumUpCredentialConformance(fixture: PortBackendFixture): void {
  describe(`SumUpCredentialStore conformance on ${fixture.name}`, () => {
    let db: PortDatabase;
    let storeA: SumUpCredentialStore;
    let storeB: SumUpCredentialStore;

    beforeAll(async () => {
      db = await fixture.create();
      storeA = (await db.connect()).sumUpCredentials;
      storeB = (await db.connect()).sumUpCredentials;
    }, 120_000);

    afterAll(async () => {
      await db.close();
    });

    it('keeps a matching pair when independent connections save the first credentials at the same time', async () => {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          (index % 2 ? storeB : storeA).saveCredentials({
            encryptedApiKey: `enc:key-${index}`,
            merchantCode: `M${index}`,
          }),
        ),
      );

      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([]);
      const apiKey = (await storeA.getEncryptedApiKey()) as string;
      const merchant = (await storeB.getMerchantCode()) as string;
      // Both values of one save, never the key of one caller and the merchant code of another.
      expect(apiKey.replace('enc:key-', '')).toBe(merchant.replace('M', ''));
      expect(await db.countSettings('sumup')).toBe(2);
    });
  });
}
