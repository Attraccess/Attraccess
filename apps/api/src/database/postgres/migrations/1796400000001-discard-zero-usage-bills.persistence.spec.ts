import {
  BillingTransactionStatus,
  ResourceMeteringSessionStatus,
  ResourceType,
  ResourceUsageAction,
} from '@attraccess/application-models';
import {
  BillingTransaction,
  BillingTransactionItem,
  Resource,
  ResourceMeter,
  ResourceMeteringSession,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { DiscardZeroUsageBills1796400000001 } from './1796400000001-discard-zero-usage-bills';

jest.setTimeout(120_000);

describe('DiscardZeroUsageBills1796400000001 (persistence)', () => {
  let source: DataSource;
  let userId: number;
  let resourceId: number;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
    userId = (await source.getRepository(User).save({ username: 'alice', email: 'alice@example.test' })).id;
    resourceId = (await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine })).id;
  });
  afterEach(() => closeTestDataSource(source));

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await new DiscardZeroUsageBills1796400000001()[direction](runner);
    } finally {
      await runner.release();
    }
  };

  const usage = async () =>
    (
      await source.getRepository(ResourceUsage).save({
        resourceId,
        userId,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-11-13T09:00:00.000Z'),
        endTime: new Date('2026-11-13T09:10:00.000Z'),
      })
    ).id;

  /** A bill (of a new usage unless `resourceUsageId` is null) with the given items as [unitPrice, quantity]. */
  const bill = async (
    fields: Partial<BillingTransaction> & { amount: number },
    items: Array<[unitPrice: number, quantity: number]> = [],
  ) => {
    const saved = await source.getRepository(BillingTransaction).save({
      userId,
      status: BillingTransactionStatus.Completed,
      resourceUsageId: fields.resourceUsageId === null ? undefined : await usage(),
      ...fields,
    });
    for (const [unitPrice, quantity] of items) {
      await source
        .getRepository(BillingTransactionItem)
        .save({ billingTransactionId: saved.id, name: 'PER_SESSION', unitPrice, quantity });
    }
    return saved.id;
  };

  const remaining = async () =>
    (await source.getRepository(BillingTransaction).find({ order: { id: 'ASC' } })).map((row) => row.id);
  const balance = async () => (await source.getRepository(User).findOneByOrFail({ id: userId })).creditBalance;

  it('deletes completed 0 credit usage bills whose items have no value, with their items', async () => {
    await bill({ amount: 0 });
    await bill({ amount: 0 }, [
      [0, 1],
      [5, 0],
    ]);

    await run('up');

    expect(await remaining()).toEqual([]);
    expect(await source.getRepository(BillingTransactionItem).count()).toBe(0);
  });

  it('keeps every other transaction and the balance', async () => {
    const topUp = await bill({ amount: 40, resourceUsageId: null });
    const manualZero = await bill({ amount: 0, resourceUsageId: null });
    const charged = await bill({ amount: -10 }, [[10, 1]]);
    const fullyDiscounted = await bill({ amount: 0 }, [
      [6, 1],
      [-6, 1],
    ]);
    const pending = await bill({ amount: 0, status: BillingTransactionStatus.Pending });
    const refunded = await bill({ amount: 0 });
    const refund = await bill({ amount: 0, resourceUsageId: null, refundOfId: refunded });
    const corrected = await bill({ amount: 0 });
    const correction = await bill({ amount: -3, resourceUsageId: null, correctionOfId: corrected });
    const before = await balance();

    await run('up');

    expect(await remaining()).toEqual([
      topUp,
      manualZero,
      charged,
      fullyDiscounted,
      pending,
      refunded,
      refund,
      corrected,
      correction,
    ]);
    expect(await balance()).toBe(before);
    expect(before).toBe(27);
  });

  it('keeps the bill of a usage that waits for a priced meter reading', async () => {
    const anchor = await bill({ amount: 0 }, [[0, 1]]);
    const { resourceUsageId } = await source.getRepository(BillingTransaction).findOneByOrFail({ id: anchor });
    const meter = await source.getRepository(ResourceMeter).save({ resourceId, name: 'Energy', creditsPerUnit: 30 });
    await source.getRepository(ResourceMeteringSession).save({
      id: 'pending-meter',
      resourceId,
      usageId: resourceUsageId as number,
      status: ResourceMeteringSessionStatus.Pending,
      meterId: meter.id,
      meterName: meter.name,
      creditsPerUnit: 30,
    });

    await run('up');

    expect(await remaining()).toEqual([anchor]);
  });

  it('runs again without changes, and its revert changes nothing', async () => {
    const charged = await bill({ amount: -10 }, [[10, 1]]);
    await bill({ amount: 0 });

    await run('up');
    await run('up');
    await run('down');

    expect(await remaining()).toEqual([charged]);
  });
});
