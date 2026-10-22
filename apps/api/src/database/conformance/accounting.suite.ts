import { beforeEach, afterEach, describe, expect, it } from '@jest/globals';
import { BillingTransactionStatus } from '@attraccess/application-models';
import { ApplicationFixture, ApplicationFixtureFactory, ApplicationClient } from './backend-fixture';

/** Both requests enter their owning phase before either may acquire a database lock. No sleeps or retries. */
export async function overlap<T>(
  a: ApplicationClient,
  b: ApplicationClient,
  left: () => Promise<T>,
  right: () => Promise<T>,
) {
  const ga = a.gateNextPhase();
  const gb = b.gateNextPhase();
  const l = left();
  const r = right();
  const settled = Promise.allSettled([l, r]);
  try {
    await Promise.all([ga.entered, gb.entered]);
  } finally {
    ga.release();
    gb.release();
  }
  return settled;
}

export function accountingConformance(name: string, factory: ApplicationFixtureFactory) {
  describe(`${name}: exact accounting across independent clients`, () => {
    let fixture: ApplicationFixture;
    let a: ApplicationClient;
    let b: ApplicationClient;
    beforeEach(async () => {
      fixture = await factory();
      a = await fixture.client();
      b = await fixture.client();
    }, 60_000);
    afterEach(async () => {
      await fixture?.close();
    });
    it('declares capabilities and shares persisted state through distinct connections', async () => {
      expect(fixture.capabilities.independentConnections).toBe(true);
      expect(a.connectionIdentity).not.toBe(b.connectionIdentity);
      expect(await a.snapshot()).toEqual(await b.snapshot());
      const credit = await a.manual(123456789);
      expect(credit.amount).toBe(123456789);
      expect((await b.snapshot()).balances).toEqual([123456889, 100]);
      await b.refund(credit.id, 17);
      expect((await a.snapshot()).balances).toEqual([123456872, 100]);
      expect(await fixture.integrityViolations()).toEqual([]);
    });
    it('does not overspend a shared account when two debit requests overlap', async () => {
      const results = await overlap(
        a,
        b,
        () => a.manual(-60),
        () => b.manual(-60),
      );
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      const snapshot = await a.snapshot();
      expect(snapshot.balances).toEqual([40, 100]);
      expect(snapshot.ledger.filter((row) => row.amount === -60)).toHaveLength(1);
    });
    it('finalizes one pending usage charge once without replaying device effects', async () => {
      const id = await fixture.seedClosedUsage();
      const results = await overlap(
        a,
        b,
        () => a.charge(id),
        () => b.charge(id),
      );
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      const snapshot = await a.snapshot();
      expect(snapshot.balances).toEqual([93, 100]);
      expect(snapshot.ledger.filter((row) => row.resourceUsageId === id)).toEqual([
        expect.objectContaining({ status: BillingTransactionStatus.Completed, amount: -7 }),
      ]);
      expect(a.effectCount() + b.effectCount()).toBe(0);
      expect(await fixture.integrityViolations()).toEqual([]);
    });
  });
}
