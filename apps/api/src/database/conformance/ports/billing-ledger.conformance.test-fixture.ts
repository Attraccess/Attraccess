import { BillingTransactionStatus } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';
import { BillableUsage } from '../../../billing/charges/billable-usage';
import { BillingService } from '../../../billing/charges/billing.service';
import { LiveNotificationsService } from '../../../billing/live-notifications/live-notifications.service';
import type { PortBackendFixture, PortConnection, PortDatabase, SeededMember } from './port-fixture';

interface BillingConnection {
  ports: PortConnection;
  service: BillingService;
  mail: { sendResourceUsageBillingSummaryEmail: jest.Mock };
}

/** The application's billing service on the ports of one connection, with its non-persistence collaborators faked. */
function billingOn(ports: PortConnection): BillingConnection {
  const mail = { sendResourceUsageBillingSummaryEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    ports.billingLedger,
    ports.billingConfiguration,
    new LiveNotificationsService(ports.billingLedger),
    { getNodes: async () => [] } as never,
    mail as never,
    { emit: jest.fn() } as never,
    { billingTransactionsTotal: { inc: jest.fn() }, billingTransactionAmount: { observe: jest.fn() } } as never,
    ports.audit,
    ports.unitOfWork,
  );
  return { ports, service, mail };
}

/** The usage {@link PortDatabase.seedFinishedUsage} stored, as the billing service charges it (25 credits). */
const billable = (member: SeededMember, usageId: number): BillableUsage => ({
  id: usageId,
  userId: member.userId,
  startTime: new Date('2026-11-13T09:00:00.000Z'),
  endTime: new Date('2026-11-13T09:10:00.000Z'),
  resource: { id: member.resourceId },
  user: { billingFactor: 100 },
  sessionDurationCreditsPerMinute: 2,
  operatingDurationCreditsPerMinute: 0,
  creditsPerUsage: 5,
});

/** Resolves after `promise` settled, or reports that it was still pending after `ms`. */
const settlesWithin = (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);

/**
 * The BillingLedgerStore contract every backend must meet across independent connections: balances are exact under
 * concurrent writers, a usage is charged once, and the ledger takes part in the caller's unit of work.
 */
export function describeBillingLedgerConformance(fixture: PortBackendFixture): void {
  describe(`BillingLedgerStore conformance on ${fixture.name}`, () => {
    let db: PortDatabase;
    let main: BillingConnection;
    let other: BillingConnection;

    beforeAll(async () => {
      db = await fixture.create();
      main = billingOn(await db.connect());
      other = billingOn(await db.connect());
    }, 120_000);

    afterAll(async () => {
      await db.close();
    });

    const balanceOf = async (userId: number) => (await main.ports.billingLedger.getBalance(userId)) as number;
    const topUp = (userId: number, amount: number) =>
      main.ports.billingLedger.insertTransaction({ userId, amount, status: BillingTransactionStatus.Completed });

    it('reads the balance a caller transaction has not committed yet', async () => {
      const { userId } = await db.seedMember('inside');

      await main.ports.unitOfWork.run(async (scope) => {
        await main.ports.billingLedger.insertTransaction(
          { userId, amount: 40, status: BillingTransactionStatus.Completed },
          { context: scope },
        );
        expect(await main.ports.billingLedger.getBalance(userId, scope)).toBe(40);
        expect(await main.ports.billingLedger.getBalance(userId)).toBe(0);
      });
      expect(await balanceOf(userId)).toBe(40);
    });

    it('keeps the balance exact when independent connections add to the same account at once', async () => {
      const { userId } = await db.seedMember('race');
      const writers = [main, other];

      await Promise.all(
        Array.from({ length: 30 }, (_, index) =>
          writers[index % 2].ports.billingLedger.insertTransaction({
            userId,
            amount: 3,
            status: BillingTransactionStatus.Completed,
          }),
        ),
      );

      expect(await balanceOf(userId)).toBe(90);
      expect(await db.countUserTransactions(userId)).toBe(30);
    }, 60_000);

    it('joins the caller unit of work: nothing persists or is published when it rolls back', async () => {
      const member = await db.seedMember('joined');
      const usageId = await db.seedFinishedUsage(member);
      const effect = jest.fn();

      await expect(
        main.ports.unitOfWork.run(async (scope) => {
          await main.service.chargeForResourceUsage(billable(member, usageId), scope);
          scope.afterCommit(effect);
          throw new Error('abort the lifecycle');
        }),
      ).rejects.toThrow('abort the lifecycle');

      expect(await db.countUsageTransactions(usageId)).toBe(0);
      expect(effect).not.toHaveBeenCalled();
      expect(main.mail.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('charges a usage exactly once when two connections settle it at the same time', async () => {
      const member = await db.seedMember('dup');
      const usageId = await db.seedFinishedUsage(member);
      await topUp(member.userId, 100);

      const outcomes = await Promise.allSettled([
        main.service.chargeForResourceUsage(billable(member, usageId)),
        other.service.chargeForResourceUsage(billable(member, usageId)),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(BadRequestException);
      expect(await db.countUsageTransactions(usageId)).toBe(1);
      expect(await balanceOf(member.userId)).toBe(75);
    }, 60_000);

    describe('independent accounts are not forced through an application-wide lock', () => {
      /** Holds a unit of work on `userId` open on the main connection until the returned release is called. */
      async function holdOpenUnit(userId: number) {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        let entered!: () => void;
        const opened = new Promise<void>((resolve) => (entered = resolve));
        const unit = main.ports.unitOfWork.run(async (scope) => {
          await main.ports.billingLedger.insertTransaction(
            { userId, amount: 1, status: BillingTransactionStatus.Completed },
            { context: scope },
          );
          entered();
          await gate;
        });
        await Promise.race([
          opened,
          unit.then(() => Promise.reject(new Error('The held unit of work ended before it was open'))),
        ]);
        return { release, unit };
      }

      it("reads another account's balance on a second connection while a unit of work is open", async () => {
        const held = await db.seedMember('held-reader');
        const free = await db.seedMember('free-reader');
        await other.ports.billingLedger.insertTransaction({
          userId: free.userId,
          amount: 9,
          status: BillingTransactionStatus.Completed,
        });
        const { release, unit } = await holdOpenUnit(held.userId);
        try {
          const read = other.ports.billingLedger.getBalance(free.userId);
          expect(await settlesWithin(read, 2_000)).toBe(true);
          expect(await read).toBe(9);
        } finally {
          release();
          await unit;
        }
        expect(await balanceOf(held.userId)).toBe(1);
      });

      (fixture.concurrentWriters ? it : it.skip)(
        'commits a unit of work on another account on a second connection while the first one is open',
        async () => {
          const held = await db.seedMember('held-writer');
          const free = await db.seedMember('free-writer');
          const { release, unit } = await holdOpenUnit(held.userId);
          try {
            const write = other.ports.unitOfWork.run((scope) =>
              other.ports.billingLedger.insertTransaction(
                { userId: free.userId, amount: 4, status: BillingTransactionStatus.Completed },
                { context: scope },
              ),
            );
            expect(await settlesWithin(write, 2_000)).toBe(true);
          } finally {
            release();
            await unit;
          }
          expect([await balanceOf(held.userId), await balanceOf(free.userId)]).toEqual([1, 4]);
        },
      );

      it('lets the second account commit once the first unit of work finished, without a deadlock', async () => {
        const held = await db.seedMember('held-queued');
        const free = await db.seedMember('free-queued');
        const { release, unit } = await holdOpenUnit(held.userId);
        const write = other.ports.unitOfWork.run((scope) =>
          other.ports.billingLedger.insertTransaction(
            { userId: free.userId, amount: 4, status: BillingTransactionStatus.Completed },
            { context: scope },
          ),
        );
        release();
        await Promise.all([unit, write]);
        expect([await balanceOf(held.userId), await balanceOf(free.userId)]).toEqual([1, 4]);
      }, 30_000);
    });
  });
}
