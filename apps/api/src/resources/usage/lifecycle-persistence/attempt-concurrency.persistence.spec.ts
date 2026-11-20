import { BillingTransaction, BillingTransactionItem, ResourceUsage } from '@attraccess/database-entities';
import { BillingTransactionStatus } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import type { TransactionScope } from '../../../database/unit-of-work';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';

/** Connections of this test database that wait for a lock (the transactions queued behind the holder). */
async function waitForLockWaiters(source: DataSource, count: number) {
  for (let polls = 0; polls < 200; polls++) {
    const [{ waiting }] = (await source.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    )) as Array<{ waiting: number }>;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Fewer than ${count} transactions waited for the lock`);
}

// Independent pool connections against a real database: attempt changes must queue, not overwrite each other.
describe('Usage lifecycle attempts under concurrent transactions', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  it('keeps the billing items that parallel flow branches stage on one attempt', async () => {
    const energy = { ...scope.draftItem, name: 'Energy' };
    const material = { ...scope.draftItem, name: 'Material' };
    scope.flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, _scope, { lifecycleAttemptId }) => {
      // Another transaction holds the attempt row, so both branches have started before either can write.
      const holder = scope.source.createQueryRunner();
      await holder.connect();
      try {
        await holder.startTransaction();
        await holder.query('SELECT 1 FROM "resource_usage_lifecycle_attempt" WHERE "id" = $1 FOR UPDATE', [
          lifecycleAttemptId,
        ]);
        const branches = [energy, material].map((item) =>
          scope.usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, item),
        );
        await waitForLockWaiters(scope.source, 2);
        await holder.commitTransaction();
        await Promise.all(branches);
      } finally {
        await holder.release();
      }
    });

    const started = await scope.usage.startSession(1, scope.users[0], {});

    const bill = await scope.source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: started.id });
    const items = await scope.source
      .getRepository(BillingTransactionItem)
      .find({ where: { billingTransactionId: bill.id }, order: { name: 'ASC' } });
    expect(items.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: 'Energy', quantity: energy.quantity },
      { name: 'Material', quantity: material.quantity },
    ]);
  });

  it('runs a commit phase again after a serialization failure and its post-commit effect once', async () => {
    // Fails the first publish of a tentative session only: a sequence keeps counting across the rollback.
    await scope.source.query('CREATE SEQUENCE "publish_attempts"');
    await scope.installTrigger({
      name: 'conflict_on_first_publish',
      table: 'resource_usage',
      event: 'UPDATE OF "lifecyclePending"',
      when: 'OLD."lifecyclePending" AND NOT NEW."lifecyclePending"',
      body: `IF nextval('publish_attempts') = 1 THEN
        RAISE EXCEPTION 'could not serialize access' USING ERRCODE = '40001';
      END IF;`,
    });
    const effect = jest.fn();
    const managerOf = (transaction: TransactionScope) => unitOfWorkFor(scope.source).handleOf(transaction);
    scope.billing.handleResourceUsageStart.mockImplementation(
      async (_resourceId: number, session: ResourceUsage, user: { id: number }, transaction: TransactionScope) => {
        transaction.afterCommit(effect);
        await managerOf(transaction).save(BillingTransaction, {
          resourceUsageId: session.id,
          userId: user.id,
          amount: 0,
          status: BillingTransactionStatus.Pending,
        });
      },
    );

    const started = await scope.usage.startSession(1, scope.users[0], {});

    expect(scope.billing.handleResourceUsageStart).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: started.id })).toMatchObject({
      lifecyclePending: false,
      isFinalized: true,
    });
    expect(await scope.source.getRepository(BillingTransaction).countBy({ resourceUsageId: started.id })).toBe(1);
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
  });
});
