import { BillingTransactionStatus } from '@attraccess/application-models';
import { BillingTransaction, BillingTransactionItem } from '@attraccess/database-entities';
import type { BillableUsage } from '../../../billing/charges/billable-usage';
import { createBillingDatabase, type BillingConnection } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

/**
 * What the billing adapters guarantee under real parallel transactions on independent connections (PostgreSQL, read
 * committed, no process-wide write lock): the balance trigger adds postings up exactly, and a usage is charged once.
 */
describe('Billing under concurrency', () => {
  let db: Database;
  let a: BillingConnection;
  let b: BillingConnection;

  beforeAll(async () => {
    db = await createBillingDatabase();
    a = await db.connect();
    b = await db.connectIndependent();
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  const billable = (usage: { id: number; userId: number | null; resourceId: number }): BillableUsage => ({
    id: usage.id,
    userId: usage.userId,
    startTime: new Date('2026-11-13T09:00:00.000Z'),
    endTime: new Date('2026-11-13T09:10:00.000Z'),
    resource: { id: usage.resourceId },
    user: { billingFactor: 100 },
    sessionDurationCreditsPerMinute: 2,
    operatingDurationCreditsPerMinute: 0,
    creditsPerUsage: 5,
  });

  it('adds up postings from both connections exactly (the balance is changed by the trigger, never read and written)', async () => {
    const { user } = await db.seed(db.primary, 'sum');
    const post = (instance: BillingConnection, amount: number) =>
      instance.ledger.insertTransaction({ userId: user.id, amount, status: BillingTransactionStatus.Completed });

    await Promise.all(Array.from({ length: 24 }, (_, index) => post(index % 2 ? a : b, index % 3 === 0 ? -7 : 11)));

    const expected = Array.from({ length: 24 }, (_, index) => (index % 3 === 0 ? -7 : 11)).reduce((s, n) => s + n, 0);
    expect(await a.ledger.getBalance(user.id)).toBe(expected);
  });

  it('charges a usage once when both connections settle it at the same time', async () => {
    const { user, resource } = await db.seed(db.primary, 'once');
    const usage = await db.seedUsage(db.primary, user.id, resource.id);
    // The usage's pending start transaction, as the start of a session leaves it.
    await a.ledger.insertTransaction({
      userId: user.id,
      resourceUsageId: usage.id,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });

    const results = await Promise.allSettled([
      a.service.chargeForResourceUsage(billable(usage)),
      b.service.chargeForResourceUsage(billable(usage)),
      a.service.chargeForResourceUsage(billable(usage)),
      b.service.chargeForResourceUsage(billable(usage)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach((result) => expect(String(result.reason)).toContain('already exists'));
    // 10 minutes at 2 per minute plus the 5 per usage, once.
    expect(await a.ledger.getBalance(user.id)).toBe(-25);
    const rows = await db.primary.getRepository(BillingTransaction).find({ where: { resourceUsageId: usage.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: BillingTransactionStatus.Completed, amount: -25 });
    const items = await db.primary.getRepository(BillingTransactionItem).find({
      where: { billingTransactionId: rows[0].id },
    });
    expect(items.map((item) => item.name).sort()).toEqual(['PER_MINUTE', 'PER_SESSION']);
  });

  it('creates one bill for a usage that had none when both connections charge it at the same time', async () => {
    const { user, resource } = await db.seed(db.primary, 'nobill');
    const usage = await db.seedUsage(db.primary, user.id, resource.id);

    const results = await Promise.allSettled([
      a.service.chargeForResourceUsage(billable(usage)),
      b.service.chargeForResourceUsage(billable(usage)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await a.ledger.getBalance(user.id)).toBe(-25);
    expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(1);
  });
});
