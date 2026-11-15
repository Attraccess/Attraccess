import { BillingTransaction, BillingTransactionStatus, Resource, ResourceUsage } from '@attraccess/database-entities';
import { DataSource, EntitySchema } from 'typeorm';

import { getProjectUsageStats } from './project-usage-statistics';

/** A meter share billed after the session ended is a correction without a usage: it counts toward the original's project. */
describe('Project spend statistics', () => {
  let source: DataSource;

  const schemas = [
    new EntitySchema<Resource>({
      name: 'Resource',
      target: Resource,
      tableName: 'resource',
      columns: { id: { type: Number, primary: true }, name: { type: String } },
    }),
    new EntitySchema<ResourceUsage>({
      name: 'ResourceUsage',
      target: ResourceUsage,
      tableName: 'resource_usage',
      columns: {
        id: { type: Number, primary: true },
        resourceId: { type: Number },
        projectId: { type: Number, nullable: true },
        startTime: { type: 'datetime' },
        endTime: { type: 'datetime', nullable: true },
        usageInMinutes: { type: Number, default: 0 },
      },
      relations: { resource: { type: 'many-to-one', target: 'Resource', joinColumn: { name: 'resourceId' } } },
    }),
    new EntitySchema<BillingTransaction>({
      name: 'BillingTransaction',
      target: BillingTransaction,
      tableName: 'billing_transaction',
      columns: {
        id: { type: Number, primary: true, generated: true },
        userId: { type: Number },
        resourceUsageId: { type: Number, nullable: true },
        correctionOfId: { type: Number, nullable: true },
        amount: { type: Number },
        status: { type: String },
      },
      relations: {
        correctionOf: { type: 'many-to-one', target: 'BillingTransaction', joinColumn: { name: 'correctionOfId' } },
      },
    }),
  ];

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: schemas,
    }).initialize();
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('counts completed correction transactions under the project of the session they correct', async () => {
    await source.getRepository(Resource).save({ id: 1, name: 'Laser' });
    const usages = source.getRepository(ResourceUsage);
    const day = new Date('2026-05-01T10:00:00Z');
    await usages.save([
      {
        id: 1,
        resourceId: 1,
        projectId: 7,
        startTime: day,
        endTime: new Date('2026-05-01T11:00:00Z'),
        usageInMinutes: 60,
      },
      {
        id: 2,
        resourceId: 1,
        projectId: 8,
        startTime: day,
        endTime: new Date('2026-05-01T11:00:00Z'),
        usageInMinutes: 60,
      },
    ]);
    const transactions = source.getRepository(BillingTransaction);
    const completed = BillingTransactionStatus.Completed;
    const first = await transactions.save({ userId: 1, resourceUsageId: 1, amount: -100, status: completed });
    const second = await transactions.save({ userId: 2, resourceUsageId: 2, amount: -50, status: completed });
    await transactions.save([
      { userId: 1, correctionOfId: first.id, amount: -30, status: completed },
      { userId: 2, correctionOfId: second.id, amount: -20, status: completed },
      { userId: 1, correctionOfId: first.id, amount: -999, status: BillingTransactionStatus.Pending },
    ]);

    const stats = await getProjectUsageStats(
      {
        projectAccessService: { getAccessOrThrow: jest.fn().mockResolvedValue(undefined) },
        getBillingConfiguration: jest.fn().mockResolvedValue({ currency: 'EUR', minorUnit: 2 }),
        resourceUsageRepository: source.getRepository(ResourceUsage),
        billingTransactionRepository: source.getRepository(BillingTransaction),
        applyDateFilters: jest.fn(),
      } as never,
      1,
      7,
      {} as never,
    );

    expect(stats.summary.totalSpend).toBe(130);
    expect(stats.topResources[0]).toMatchObject({ resourceId: 1, spend: 130 });
  });
});
