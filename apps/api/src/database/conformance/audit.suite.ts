import { beforeEach, afterEach, describe, expect, it } from '@jest/globals';
import { ApplicationFixture, ApplicationFixtureFactory, ApplicationClient } from './backend-fixture';
import { AUDIT_COMMIT_BOUNDARY } from '../../audit/persistence/port';
import { BILLING_OPERATIONS } from '../../billing/persistence/port';
import { BillingTransactionStatus } from '@attraccess/application-models';

export function auditConformance(name: string, factory: ApplicationFixtureFactory) {
  describe(`${name}: independent audit durability and parent transaction contract`, () => {
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
    it('keeps an acknowledged audit record across a later business rollback', async () => {
      expect(await a.recordAudit()).toBe(true);
      let notifications = 0;
      let callbacks = 0;
      await expect(
        a.transactions.run({ resourceIds: [1], accountIds: [1] }, async (scope) => {
          callbacks++;
          expect('query' in scope).toBe(false);
          await scope
            .resolve(BILLING_OPERATIONS)
            .createTransaction({ userId: 1, amount: -17, status: BillingTransactionStatus.Completed });
          scope.afterCommit(() => {
            notifications++;
          });
          await a.transactions.run(
            { resourceIds: [1], accountIds: [1] },
            async (nested) => {
              expect(nested).toBe(scope);
              callbacks++;
              nested.afterCommit(() => {
                notifications++;
              });
            },
            scope,
          );
          await expect(
            a.transactions.run({ resourceIds: [2], accountIds: [] }, async () => undefined, scope),
          ).rejects.toThrow('expand');
          throw new Error('business rollback');
        }),
      ).rejects.toThrow('business rollback');
      expect(callbacks).toBe(2);
      expect(notifications).toBe(0);
      const state = await b.snapshot();
      expect(state.balances).toEqual([100, 100]);
      expect(state.audit).toHaveLength(1);
    });
    it('suppresses deferred audit on rollback and publishes it only after the outer commit', async () => {
      let receipt: Promise<unknown> = Promise.resolve(undefined);
      let writes = 0;
      const work = async (scope) => {
        receipt = scope.resolve(AUDIT_COMMIT_BOUNDARY).defer(async () => {
          writes++;
          expect(await b.recordAudit()).toBe(true);
          return { status: 'recorded' as const };
        });
      };
      await expect(
        a.transactions.run({ resourceIds: [1], accountIds: [] }, async (scope) => {
          await work(scope);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await receipt).toEqual({ status: 'unavailable' });
      expect(writes).toBe(0);
      await a.transactions.run({ resourceIds: [1], accountIds: [] }, async (scope) => {
        await a.transactions.run({ resourceIds: [1], accountIds: [] }, work, scope);
        expect(writes).toBe(0);
      });
      expect(await receipt).toEqual({ status: 'recorded' });
      expect(writes).toBe(1);
      expect((await b.snapshot()).audit).toHaveLength(1);
    });
    it('does not acknowledge unavailable audit storage or undo a committed ledger update', async () => {
      await fixture.rejectAudit(true);
      expect(await a.recordAudit()).toBe(false);
      await a.manual(17);
      const state = await a.snapshot();
      expect(state.balances).toEqual([117, 100]);
      expect(state.audit).toEqual([]);
    });
  });
}
