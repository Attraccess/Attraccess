import { BillingTransactionStatus, ResourceMeteringSessionStatus } from '@attraccess/application-models';
import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceMeter,
  ResourceMeteringSession,
  Setting,
  User,
} from '@attraccess/database-entities';
import { instanceToPlain } from 'class-transformer';
import { billingTransactionAuditEvent } from '../../../audit/policies/billing';
import { toBillingTransactionDto } from '../../../billing/dto/billing-dto.mapper';
import { BillableUsage } from '../../../billing/charges/billable-usage';
import { BillingConnection, createBillingDatabase } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('TypeOrmBillingLedgerStore on real PostgreSQL', () => {
  let db: Database;
  let main: BillingConnection;

  beforeAll(async () => {
    db = await createBillingDatabase();
    main = await db.connect();
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    main.mail.sendResourceUsageBillingSummaryEmail.mockClear();
  });

  const balanceOf = async (userId: number) => (await main.ledger.getBalance(userId)) as number;

  const billable = (
    usage: { id: number; userId: number | null; resourceId: number },
    overrides: Partial<BillableUsage> = {},
  ): BillableUsage => ({
    id: usage.id,
    userId: usage.userId,
    startTime: new Date('2026-11-13T09:00:00.000Z'),
    endTime: new Date('2026-11-13T09:10:00.000Z'),
    resource: { id: usage.resourceId },
    user: { billingFactor: 100 },
    sessionDurationCreditsPerMinute: 2,
    operatingDurationCreditsPerMinute: 0,
    creditsPerUsage: 5,
    ...overrides,
  });

  describe('mapping', () => {
    it('shows a transaction history exactly as the entities were serialized for the HTTP API', async () => {
      const { user, resource } = await db.seed(db.primary, 'history');
      const initiator = await db.primary.getRepository(User).save({ username: 'admin-history', email: 'a@h.test' });
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      const original = await main.ledger.insertTransaction({
        userId: user.id,
        initiatorId: initiator.id,
        amount: -25,
        status: BillingTransactionStatus.Completed,
        resourceUsageId: usage.id,
      });
      await db.primary.getRepository(BillingTransactionItem).save({
        billingTransactionId: original.id,
        name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
        unitPrice: 23,
        quantity: 1,
        durationMs: 225_000,
        allocation: { kind: 'operating-time', segments: [] },
      });
      await main.ledger.insertTransaction({
        userId: user.id,
        amount: 25,
        status: BillingTransactionStatus.Completed,
        refundOfId: original.id,
      });

      const { transactions, total } = await main.ledger.listTransactionsForUser(user.id, { page: 1, limit: 10 });

      // What the controller used to return: the loaded entities, serialized by the global class serializer.
      const entitiesBefore = await db.primary.getRepository(BillingTransaction).find({
        where: { userId: user.id },
        relations: { initiator: true, resourceUsage: { resource: true }, refundOf: true, items: true },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      expect(total).toBe(2);
      expect(asJson(transactions.map(toBillingTransactionDto))).toEqual(asJson(instanceToPlain(entitiesBefore)));
      // Mail addresses and other excluded user fields never appear.
      const shown = asJson(transactions);
      expect(JSON.stringify(shown)).not.toContain('a@h.test');
      expect(shown[1].initiator).toEqual(expect.objectContaining({ id: initiator.id, username: 'admin-history' }));
      expect(shown[1].resourceUsage.resource).toEqual(expect.objectContaining({ id: resource.id }));
    });

    it('returns the detail of one transaction only to its owner', async () => {
      const { user } = await db.seed(db.primary, 'owner');
      const created = await main.ledger.insertTransaction({
        userId: user.id,
        amount: 10,
        status: BillingTransactionStatus.Completed,
      });

      expect(await main.ledger.findTransactionDetail(created.id, user.id + 1000)).toBeNull();
      expect(await main.ledger.findTransactionDetail(created.id, user.id)).toMatchObject({ id: created.id });
      expect(await main.ledger.findTransactionDetail(created.id)).toMatchObject({ id: created.id });
    });

    it('returns only what an insert wrote, as the HTTP responses did before', async () => {
      const { user } = await db.seed(db.primary, 'inserted');

      const created = await main.ledger.insertTransaction({
        userId: user.id,
        initiatorId: user.id,
        amount: 7,
        status: BillingTransactionStatus.Completed,
      });

      // The row a plain repository save returns: the response of this write before the port existed.
      const direct = await db.primary.getRepository(BillingTransaction).save({
        userId: user.id,
        initiatorId: user.id,
        amount: 7,
        status: BillingTransactionStatus.Completed,
      });
      expect(Object.keys(asJson(toBillingTransactionDto(created))).sort()).toEqual(Object.keys(asJson(direct)).sort());
    });
  });

  describe('balance', () => {
    it('moves with completed transactions only, and exactly once per status change', async () => {
      const { user } = await db.seed(db.primary, 'balance');
      expect(await balanceOf(user.id)).toBe(0);

      const pending = await main.ledger.insertTransaction({
        userId: user.id,
        amount: 500,
        status: BillingTransactionStatus.Pending,
        externalReference: 'sumup_topup_transaction:abc',
      });
      expect(await balanceOf(user.id)).toBe(0);

      await main.ledger.updateTransactionStatus(pending.id, BillingTransactionStatus.Completed);
      expect(await balanceOf(user.id)).toBe(500);
      await main.ledger.updateTransactionStatus(pending.id, BillingTransactionStatus.Completed);
      expect(await balanceOf(user.id)).toBe(500);
      await main.ledger.updateTransactionStatus(pending.id, BillingTransactionStatus.Failed);
      expect(await balanceOf(user.id)).toBe(0);
    });

    it('reports an absent user as null', async () => {
      expect(await main.ledger.getBalance(987654)).toBeNull();
    });

    // Uncommitted reads and exact concurrent sums are part of the BillingLedgerStore conformance suite
    // (database/conformance/ports), which runs them on every backend.
  });

  describe('settleUsageCharge', () => {
    it('stores the charge, its items and its audit row together', async () => {
      const { user, resource } = await db.seed(db.primary, 'settle');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      await main.ledger.insertTransaction({ userId: user.id, amount: 100, status: BillingTransactionStatus.Completed });

      const charge = await main.service.chargeForResourceUsage(billable(usage));

      // 10 minutes at 2 per minute plus the 5 per usage.
      expect(charge).toMatchObject({ userId: user.id, resourceUsageId: usage.id, amount: -25 });
      expect(await balanceOf(user.id)).toBe(75);
      const stored = await db.primary.getRepository(BillingTransaction).findOneOrFail({
        where: { id: charge?.id },
        relations: { items: true },
      });
      expect(stored.items.map((item) => item.name).sort()).toEqual(['PER_MINUTE', 'PER_SESSION']);
      expect(await db.primary.getRepository(Setting).countBy({ parent: 'audit-probe' })).toBeGreaterThan(0);
      expect(main.audited.at(-1)).toEqual({ operationId: `billing-transaction-${charge?.id}`, inTransaction: true });
    });

    it('completes a pending start transaction in place, including its additional items', async () => {
      const { user, resource } = await db.seed(db.primary, 'pending');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      await main.ledger.insertTransaction({ userId: user.id, amount: 100, status: BillingTransactionStatus.Completed });
      await main.service.handleResourceUsageStart(resource.id, usage, user);
      const pending = await db.primary.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usage.id });
      await db.primary
        .getRepository(BillingTransactionItem)
        .save({ billingTransactionId: pending.id, name: 'EXTRA', unitPrice: 7, quantity: 2 });

      const charge = await main.service.chargeForResourceUsage(billable(usage));

      // 25 for the session + 14 for the extra item
      expect(charge).toMatchObject({ id: pending.id, amount: -39 });
      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(1);
      expect(await balanceOf(user.id)).toBe(61);
    });

    it('rolls the whole charge back when one of its items cannot be stored', async () => {
      const { user, resource } = await db.seed(db.primary, 'rollback');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      await main.ledger.insertTransaction({ userId: user.id, amount: 100, status: BillingTransactionStatus.Completed });
      const probes = await db.primary.getRepository(Setting).countBy({ parent: 'audit-probe' });

      await expect(
        main.ledger.settleUsageCharge({
          existing: null,
          userId: user.id,
          usageId: usage.id,
          amount: -25,
          items: [
            { name: 'PER_SESSION', unitPrice: 5, quantity: 1 },
            { name: null as never, unitPrice: 1, quantity: 1 },
          ],
          audit: (transactionId) =>
            billingTransactionAuditEvent({
              transactionId,
              userId: user.id,
              amount: -25,
              status: BillingTransactionStatus.Completed,
              source: 'resource-usage',
            }),
        }),
      ).rejects.toThrow();

      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(0);
      expect(await balanceOf(user.id)).toBe(100);
      expect(await db.primary.getRepository(Setting).countBy({ parent: 'audit-probe' })).toBe(probes);
    });

    it('publishes the receipt only after the charge committed', async () => {
      const { user, resource } = await db.seed(db.primary, 'publish');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      let visibleWhenMailed: number | undefined;
      main.mail.sendResourceUsageBillingSummaryEmail.mockImplementationOnce(async () => {
        visibleWhenMailed = await db.primary
          .getRepository(BillingTransaction)
          .countBy({ resourceUsageId: usage.id, status: BillingTransactionStatus.Completed });
      });

      await main.service.chargeForResourceUsage(billable(usage));

      expect(main.mail.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
      expect(visibleWhenMailed).toBe(1);
    });

    it('keeps the exact amount of a charge near the largest safe integer', async () => {
      const { user, resource } = await db.seed(db.primary, 'precision');
      const usage = await db.seedUsage(db.primary, user.id, resource.id, {
        creditsPerUsage: Number.MAX_SAFE_INTEGER - 2,
      });

      const charge = await main.service.chargeForResourceUsage(
        billable(usage, {
          creditsPerUsage: Number.MAX_SAFE_INTEGER - 2,
          sessionDurationCreditsPerMinute: 0,
          billingFactor: 67,
        }),
      );

      expect(charge?.amount).toBe(-6034823500676463);
      const stored = await db.primary.getRepository(BillingTransaction).findOneByOrFail({ id: charge?.id });
      expect(stored.amount).toBe(-6034823500676463);
      expect(await balanceOf(user.id)).toBe(-6034823500676463);
    });

    it('snapshots prices on the usage: a later price change does not alter a stored charge', async () => {
      const { user, resource } = await db.seed(db.primary, 'snapshot');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      await main.configuration.getOrCreateResourceConfiguration(resource.id);
      const charge = await main.service.chargeForResourceUsage(billable(usage));

      await main.service.updateResourceBillingConfiguration(resource.id, {
        creditsPerMinute: 1000,
        creditsPerUsage: 1000,
      });

      const stored = await db.primary.getRepository(BillingTransaction).findOneByOrFail({ id: charge?.id });
      expect(stored.amount).toBe(-25);
    });
  });

  describe('a usage without any charge', () => {
    const free = { sessionDurationCreditsPerMinute: 0, creditsPerUsage: 0 };

    const startFree = async (name: string) => {
      const { user, resource } = await db.seed(db.primary, name);
      const usage = await db.seedUsage(db.primary, user.id, resource.id, free);
      await main.service.handleResourceUsageStart(resource.id, usage, user);
      const pending = await db.primary.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usage.id });
      return { user, resource, usage, pending };
    };

    const pendingMeter = async (usage: { id: number; resourceId: number }, creditsPerUnit: number) => {
      const meter = await db.primary
        .getRepository(ResourceMeter)
        .save({ resourceId: usage.resourceId, name: 'Energy', creditsPerUnit });
      await db.primary.getRepository(ResourceMeteringSession).save({
        id: `meter-of-${usage.id}`,
        resourceId: usage.resourceId,
        usageId: usage.id,
        status: ResourceMeteringSessionStatus.Pending,
        meterId: meter.id,
        meterName: meter.name,
        creditsPerUnit,
      });
    };

    it('deletes the pending bill and its unpriced items, and leaves the balance alone', async () => {
      const { user, usage, pending } = await startFree('free');
      await db.primary
        .getRepository(BillingTransactionItem)
        .save({ billingTransactionId: pending.id, name: 'Material', unitPrice: 0, quantity: 3 });
      await main.ledger.insertTransaction({ userId: user.id, amount: 50, status: BillingTransactionStatus.Completed });

      await expect(main.service.chargeForResourceUsage(billable(usage, free))).resolves.toBeUndefined();

      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(0);
      expect(await db.primary.getRepository(BillingTransactionItem).countBy({ billingTransactionId: pending.id })).toBe(
        0,
      );
      expect(await balanceOf(user.id)).toBe(50);
      expect(main.mail.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('discards only a bill that is not completed', async () => {
      const { user, resource } = await db.seed(db.primary, 'completed');
      const usage = await db.seedUsage(db.primary, user.id, resource.id);
      await main.ledger.insertTransaction({
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Completed,
        resourceUsageId: usage.id,
      });

      const discarded = await main.unitOfWork.run((scope) => main.ledger.discardPendingUsageBill(usage.id, scope));

      expect(discarded).toBe(false);
      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(1);
    });

    it('keeps the bill as the anchor of a late correction while a priced meter reading is pending', async () => {
      const { usage, pending } = await startFree('anchor');
      await pendingMeter(usage, 30);

      const charge = await main.service.chargeForResourceUsage(billable(usage, free));

      expect(charge).toMatchObject({ id: pending.id, status: BillingTransactionStatus.Completed });
      expect(charge?.amount).toBeCloseTo(0);
    });

    it('discards the bill when the pending meter reading has no price', async () => {
      const { usage } = await startFree('unpriced-meter');
      await pendingMeter(usage, 0);

      await expect(main.service.chargeForResourceUsage(billable(usage, free))).resolves.toBeUndefined();

      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(0);
    });

    it('settles a usage a second time without an error and without creating a bill', async () => {
      const { usage } = await startFree('second');

      await main.service.chargeForResourceUsage(billable(usage, free));
      await expect(main.service.chargeForResourceUsage(billable(usage, free))).resolves.toBeUndefined();

      expect(await db.primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usage.id })).toBe(0);
    });
  });

  // Joining the caller unit of work and charging a usage exactly once across connections are part of the
  // BillingLedgerStore conformance suite (database/conformance/ports).
});
