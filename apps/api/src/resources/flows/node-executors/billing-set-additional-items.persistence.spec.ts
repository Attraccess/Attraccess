import { Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceFlowNode,
  ResourceUsage,
} from '@attraccess/database-entities';
import { DataSource, EntitySchema } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeResourceTransactionConnection,
  runSerializedTransaction,
} from '../../../database/run-serialized-transaction';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { BillingSetAdditionalItemsExecutor } from './billing-set-additional-items.executor';
import { NodeExecutionContext } from './node-executor.interface';

const schemas = [
  new EntitySchema<ResourceUsage>({
    name: 'ResourceUsage',
    target: ResourceUsage,
    tableName: 'resource_usage',
    columns: { id: { type: Number, primary: true }, resourceId: { type: Number } },
  }),
  new EntitySchema<BillingTransaction>({
    name: 'BillingTransaction',
    target: BillingTransaction,
    tableName: 'billing_transaction',
    columns: {
      id: { type: Number, primary: true },
      resourceUsageId: { type: Number },
      amount: { type: Number },
      status: { type: String },
    },
    relations: {
      resourceUsage: { type: 'one-to-one', target: 'ResourceUsage', joinColumn: { name: 'resourceUsageId' } },
    },
  }),
  new EntitySchema<BillingTransactionItem>({
    name: 'BillingTransactionItem',
    target: BillingTransactionItem,
    tableName: 'billing_transaction_item',
    columns: {
      id: { type: Number, primary: true, generated: true },
      billingTransactionId: { type: Number },
      name: { type: String },
      description: { type: String, nullable: true },
      externalReference: { type: String, nullable: true },
      quantity: { type: Number },
      unitPrice: { type: Number },
    },
  }),
];

describe('Additional billing items around finalization', () => {
  let source: DataSource;
  let directory: string;
  let executor: BillingSetAdditionalItemsExecutor;
  const item = { name: 'Energy', description: 'Meter', externalReference: 'meter-1', quantity: 3, unitPrice: 5 };
  const node = { resourceId: 1, data: item } as ResourceFlowNode;
  const ctx = { compileTemplate: (template: string) => template } as NodeExecutionContext;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    directory = await mkdtemp(join(tmpdir(), 'attraccess-billing-items-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      entities: schemas,
      synchronize: true,
    }).initialize();
    await source.getRepository(ResourceUsage).save({ id: 1, resourceId: 1 });
    await source
      .getRepository(BillingTransaction)
      .save({ id: 1, resourceUsageId: 1, status: BillingTransactionStatus.Pending, amount: 0 });
    executor = new BillingSetAdditionalItemsExecutor(
      { getActiveSession: jest.fn().mockResolvedValue({ id: 1 }) } as unknown as ResourceUsageService,
      source.getRepository(BillingTransactionItem),
    );
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it.each([
    { status: BillingTransactionStatus.Completed, existing: false },
    { status: BillingTransactionStatus.Completed, existing: true },
    { status: BillingTransactionStatus.Failed, existing: false },
    { status: BillingTransactionStatus.Failed, existing: true },
  ])('rejects delayed flow billing for $status transactions (existing=$existing)', async ({ status, existing }) => {
    await source.getRepository(BillingTransaction).update(1, { status, amount: -15 });
    if (existing) await source.getRepository(BillingTransactionItem).save({ ...item, billingTransactionId: 1 });
    const before = await source.getRepository(BillingTransactionItem).find();

    await expect(executor.execute(node, { id: 1, quantity: 2 }, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);

    expect(await source.getRepository(BillingTransactionItem).find()).toEqual(before);
    expect(await source.getRepository(BillingTransaction).findOneBy({ id: 1 })).toMatchObject({ status, amount: -15 });
  });

  it('appends and deduplicates legitimate pending event-flow items', async () => {
    await executor.execute(node, { quantity: 2 }, ctx);
    await executor.execute(node, { id: 1, quantity: 4 }, ctx);

    expect(await source.getRepository(BillingTransactionItem).find()).toEqual([
      expect.objectContaining({ billingTransactionId: 1, name: 'Energy', quantity: 6, unitPrice: 5 }),
    ]);
  });

  it('keeps item writes inside the caller-owned transaction and rejects completed bills there too', async () => {
    await expect(
      source.transaction(async (transactionManager) => {
        await executor.execute(node, { id: 1, quantity: 2 }, { ...ctx, transactionManager });
        throw new Error('caller rolled back');
      }),
    ).rejects.toThrow('caller rolled back');
    expect(await source.getRepository(BillingTransactionItem).count()).toBe(0);
    await source.getRepository(BillingTransaction).update(1, { status: BillingTransactionStatus.Completed });

    await expect(
      source.transaction((transactionManager) =>
        executor.execute(node, { id: 1, quantity: 2 }, { ...ctx, transactionManager }),
      ),
    ).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(await source.getRepository(BillingTransactionItem).count()).toBe(0);
  });

  it('rejects a delayed item queued behind finalization without changing its frozen bill', async () => {
    let entered!: () => void;
    let release!: () => void;
    const phaseEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const finishPhase = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finalization = runSerializedTransaction(source.manager, async (manager) => {
      entered();
      await finishPhase;
      await manager.update(BillingTransaction, 1, { status: BillingTransactionStatus.Completed, amount: -15 });
    });
    await phaseEntered;
    const eventLookup = jest.spyOn(source.manager, 'findOne');
    const delayedItem = executor.execute(node, { id: 1, quantity: 2 }, ctx).then(
      () => null,
      (error: unknown) => error,
    );
    // With an explicit usage ID the unqueued path reaches findOne synchronously.
    // It must not even read Pending while finalization owns the serialized phase.
    const lookupsBeforeFinalization = eventLookup.mock.calls.length;
    release();
    await finalization;
    const result = await delayedItem;

    expect(lookupsBeforeFinalization).toBe(0);
    expect(result).toBeInstanceOf(NoUsageSessionError);

    expect(await source.getRepository(BillingTransactionItem).count()).toBe(0);
    expect(await source.getRepository(BillingTransaction).findOneBy({ id: 1 })).toMatchObject({
      status: BillingTransactionStatus.Completed,
      amount: -15,
    });
  });
});
