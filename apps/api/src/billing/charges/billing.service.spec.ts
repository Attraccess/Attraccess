import { BillingTransactionStatus } from '@attraccess/application-models';
import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { billableUsage, createBillingServiceFixture } from './fixtures/billing-service.test-fixture';
import { fakeTransactionScope } from '../../database/fake-transaction-scope.test-fixture';

describe('BillingService', () => {
  let f: ReturnType<typeof createBillingServiceFixture>;

  beforeEach(() => {
    f = createBillingServiceFixture();
    f.configurationStore.configure(205);
  });

  const seedTransaction = async (amount: number, userId = 7) =>
    f.ledgerStore.insertTransaction({ userId, amount, status: BillingTransactionStatus.Completed });

  describe('reading', () => {
    it('restricts transaction lookup to its owner', async () => {
      const transaction = await seedTransaction(100, 2);

      expect(await f.service.getTransaction(transaction.id, 3)).toBeNull();
      expect(await f.service.getTransaction(transaction.id, 2)).toBe(transaction);
    });

    it('finds only the owner’s transaction ID for a usage', async () => {
      const transaction = await f.ledgerStore.insertTransaction({
        userId: 2,
        amount: 0,
        status: BillingTransactionStatus.Pending,
        resourceUsageId: 8,
      });

      expect(await f.service.getTransactionIdForUsage(8, 2)).toBe(transaction.id);
      expect(await f.service.getTransactionIdForUsage(8, 3)).toBeNull();
      expect(await f.service.getTransactionIdForUsage(9, 2)).toBeNull();
    });

    it('returns creditBalance for an existing user and fails for an absent one', async () => {
      f.ledgerStore.balances.set(1, 42);

      await expect(f.service.getBalance(1)).resolves.toBe(42);
      await expect(f.service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('passes a caller transaction on when reading the balance', async () => {
      f.ledgerStore.balances.set(1, 42);
      const context = fakeTransactionScope();

      await f.service.getBalance(1, context);

      expect(f.ledgerStore.contexts).toEqual([context]);
    });

    it('returns a page of the newest transactions with its paging', async () => {
      for (const amount of [1, 2, 3]) await seedTransaction(amount, 5);
      await seedTransaction(9, 6);

      const page = await f.service.getHistory(5, { page: 2, limit: 2 });

      expect(page.total).toBe(3);
      expect(page.page).toBe(2);
      expect(page.limit).toBe(2);
      expect(page.data.map((t) => t.amount)).toEqual([1]);
    });

    it('finds the completed charge of a usage only for its owner', async () => {
      await f.ledgerStore.insertTransaction({
        userId: 2,
        amount: -5,
        status: BillingTransactionStatus.Completed,
        resourceUsageId: 8,
      });

      expect(await f.service.getResourceUsageCharge(8, 2)).toMatchObject({ amount: -5 });
      expect(await f.service.getResourceUsageCharge(8, 3)).toBeNull();
    });
  });

  describe('refundTransaction', () => {
    it.each([100, -100])('creates an opposite-sign refund for transaction amount %s', async (amount) => {
      const original = await seedTransaction(amount);

      const refund = await f.service.refundTransaction(9, original.id, { amount: 25 });

      const expected = amount > 0 ? -25 : 25;
      expect(refund).toMatchObject({ userId: 7, initiatorId: 9, amount: expected, refundOfId: original.id });
      expect(refund?.status).toBe(BillingTransactionStatus.Completed);
      expect(f.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(refund);
      expect(f.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'billing',
          subject: { type: 'billing.transaction', id: refund?.id },
          details: expect.objectContaining({ source: 'refund', amount: expected }),
        }),
      );
    });

    it('rejects absent transactions and invalid refund amounts before writing', async () => {
      await expect(f.service.refundTransaction(9, 4, { amount: 25 })).rejects.toThrow();
      const original = await seedTransaction(-100);

      await expect(f.service.refundTransaction(9, original.id, { amount: 0 })).rejects.toThrow(
        'Amount must be greater than 0',
      );
      await expect(f.service.refundTransaction(9, original.id, { amount: 101 })).rejects.toThrow();

      expect(f.ledgerStore.transactions).toHaveLength(1);
      expect(f.audit.record).not.toHaveBeenCalled();
    });
  });

  describe('createManualTransaction', () => {
    beforeEach(() => {
      f.ledgerStore.balances.set(5, 100);
    });

    it('throws if the user does not exist', async () => {
      await expect(f.service.createManualTransaction(404, 1, 10)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(f.ledgerStore.transactions).toHaveLength(0);
    });

    it('stores a completed transaction, announces it, audits it and counts it', async () => {
      const transaction = await f.service.createManualTransaction(5, 1, 25);

      expect(transaction).toMatchObject({ userId: 5, initiatorId: 1, amount: 25 });
      expect(transaction.status).toBe(BillingTransactionStatus.Completed);
      expect(f.ledgerStore.balances.get(5)).toBe(125);
      expect(f.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(transaction);
      expect(f.audit.record).toHaveBeenCalledWith(
        billingTransactionAuditEvent({
          transactionId: transaction.id,
          userId: 5,
          initiatorId: 1,
          amount: 25,
          status: BillingTransactionStatus.Completed,
          source: 'manual',
        }),
      );
      expect(f.metrics.billingTransactionsTotal.inc).toHaveBeenCalledWith({ status: 'completed' });
      expect(f.metrics.billingTransactionAmount.observe).toHaveBeenCalledWith(25);
    });

    it('throws InsufficientBalanceError when the resulting balance would be negative', async () => {
      await expect(f.service.createManualTransaction(5, 1, -101)).rejects.toBeInstanceOf(InsufficientBalanceError);
      expect(f.ledgerStore.transactions).toHaveLength(0);
    });

    it('allows a charge when the balance stays non-negative', async () => {
      await expect(f.service.createManualTransaction(5, 1, -100)).resolves.toMatchObject({ amount: -100 });
      expect(f.ledgerStore.balances.get(5)).toBe(0);
    });

    it('allows a negative resulting balance when failOnInsufficientBalance is false', async () => {
      await expect(f.service.createManualTransaction(5, 1, -150, false)).resolves.toMatchObject({ amount: -150 });
      expect(f.ledgerStore.balances.get(5)).toBe(-50);
    });

    it('throws when the amount is fractional', async () => {
      await expect(f.service.createManualTransaction(5, 1, 1.5)).rejects.toThrow(
        'Amount must be an integer (multiply by currency minor unit)',
      );
    });
  });

  describe('chargeForResourceUsage', () => {
    it.each([
      { creditsPerUsage: 6, billingFactor: 50, expectedCharge: 15 },
      { creditsPerUsage: 0, billingFactor: 100, expectedCharge: 24 },
      { creditsPerUsage: 6, billingFactor: 0, expectedCharge: 0 },
    ])('charges the complete start-time contract ($creditsPerUsage fixed, $billingFactor%)', async (contract) => {
      const usage = billableUsage({
        endTime: new Date('2026-09-20T09:02:00Z'),
        attributedOperatingDurationInMinutes: 1,
        sessionDurationCreditsPerMinute: 10,
        operatingDurationCreditsPerMinute: 4,
        creditsPerUsage: contract.creditsPerUsage,
        billingFactor: contract.billingFactor,
        user: { billingFactor: 200 },
      });
      f.configurationStore.configure(205, { creditsPerUsage: 99, creditsPerMinute: 99, creditsPerOperatingMinute: 99 });

      const transaction = await f.service.chargeForResourceUsage(usage, fakeTransactionScope());

      expect(transaction?.amount).toBe(-contract.expectedCharge);
      expect(transaction?.items).toContainEqual(
        expect.objectContaining({ name: 'PER_SESSION', unitPrice: contract.creditsPerUsage, quantity: 1 }),
      );
      if (contract.billingFactor !== 100) {
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({ name: 'BILLING_FACTOR', description: `${contract.billingFactor}%` }),
        );
      }
    });

    it.each([
      { charge: 45, factor: 50, amount: 22 },
      { charge: Number.MAX_SAFE_INTEGER - 2, factor: 67, amount: 6034823500676463 },
      { charge: 100, factor: 12.5, amount: 12 },
    ])(
      'settles $charge credits at $factor% without floating-point rounding errors',
      async ({ charge, factor, amount }) => {
        const usage = billableUsage({
          endTime: new Date('2026-09-20T09:00:00Z'),
          creditsPerUsage: charge,
          billingFactor: factor,
        });

        const transaction = await f.service.chargeForResourceUsage(usage, fakeTransactionScope());

        expect(transaction?.amount).toBe(-amount);
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -(charge - amount) }),
        );
      },
    );

    it.each([
      { durationMs: 0, roundedMinutes: 0 },
      { durationMs: 60_000, roundedMinutes: 1 },
      { durationMs: 60_001, roundedMinutes: 2 },
    ])(
      'bills and records exact duration $durationMs ms independently for both components',
      async ({ durationMs, roundedMinutes }) => {
        const startTime = new Date('2026-09-20T09:05:00Z');
        await f.ledgerStore.insertTransaction({
          userId: 25,
          amount: 0,
          status: BillingTransactionStatus.Pending,
          resourceUsageId: 22,
        });
        const usage = billableUsage({
          startTime,
          endTime: new Date(startTime.getTime() + durationMs),
          attributedOperatingDurationInMinutes: durationMs / 60_000,
          sessionDurationCreditsPerMinute: 3,
          operatingDurationCreditsPerMinute: 7,
          // A session price, so even a session of no time has a charge and keeps its bill.
          creditsPerUsage: 1,
        });

        const transaction = await f.service.chargeForResourceUsage(usage, fakeTransactionScope());

        expect(transaction?.amount).toBe(-(roundedMinutes * 10 + 1));
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({ name: 'PER_MINUTE', durationMs, quantity: roundedMinutes, unitPrice: 3 }),
        );
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({
            name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
            durationMs,
            quantity: roundedMinutes,
            unitPrice: 7,
          }),
        );
      },
    );

    it.each([
      ['a charge of zero credits', billableUsage({ endTime: new Date('2026-09-20T09:10:00Z') })],
      ['a session that has not ended', billableUsage({ endTime: null })],
    ])('creates no transaction for %s', async (_name, usage) => {
      await expect(f.service.chargeForResourceUsage(usage, fakeTransactionScope())).resolves.toBeUndefined();

      expect(f.ledgerStore.transactions).toHaveLength(0);
      expect(f.audit.record).not.toHaveBeenCalled();
    });

    it('creates a negative billing transaction audited in the caller transaction and left unpublished', async () => {
      f.configurationStore.configure(205, { creditsPerMinute: 10, creditsPerUsage: 5 });
      const usage = billableUsage({
        startTime: new Date('2026-09-20T09:07:36.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        sessionDurationCreditsPerMinute: null,
        creditsPerUsage: null,
      });
      const callerTransaction = fakeTransactionScope();

      const transaction = await f.service.chargeForResourceUsage(usage, callerTransaction);

      // ceil(2.4) = 3 minutes * 10 + 5 = 35 credits
      expect(transaction).toMatchObject({ userId: 25, resourceUsageId: 22, amount: -35 });
      expect(f.ledgerStore.audits).toEqual([
        {
          event: billingTransactionAuditEvent({
            transactionId: transaction?.id as number,
            userId: 25,
            amount: -35,
            status: BillingTransactionStatus.Completed,
            source: 'resource-usage',
          }),
          context: callerTransaction,
        },
      ]);
      expect(f.unitOfWork.runs).toBe(0);
      expect(f.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('charges without a caller transaction in its own unit of work and publishes after it committed', async () => {
      f.configurationStore.configure(205, { creditsPerMinute: 10, creditsPerUsage: 5 });
      const usage = billableUsage({
        endTime: new Date('2026-09-20T09:02:00.000Z'),
        sessionDurationCreditsPerMinute: null,
        creditsPerUsage: null,
      });
      let publishedInsideWork = false;
      const settle = f.ledgerStore.settleUsageCharge.bind(f.ledgerStore);
      jest.spyOn(f.ledgerStore, 'settleUsageCharge').mockImplementation(async (input, context) => {
        const result = await settle(input, context);
        publishedInsideWork = f.liveNotifications.notifyTransactionUpdate.mock.calls.length > 0;
        return result;
      });
      f.ledgerStore.receipts.set(1, {
        transaction: {
          id: 1,
          userId: 25,
          amount: -25,
          status: BillingTransactionStatus.Completed,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        recipient: { id: 25, username: 'u', email: 'u@example.test', locale: 'en', creditBalance: 0 },
        usage: {
          startTime: usage.startTime,
          endTime: usage.endTime ?? null,
          billingFactor: null,
          resource: { id: 205, name: 'CNC' },
        },
      });

      const transaction = await f.service.chargeForResourceUsage(usage);

      expect(transaction?.amount).toBe(-25);
      expect(f.unitOfWork.runs).toBe(1);
      // The audit row describes the completed charge and is written in the unit of work of the charge itself.
      expect(f.ledgerStore.audits).toEqual([
        {
          event: billingTransactionAuditEvent({
            transactionId: transaction?.id as number,
            userId: 25,
            amount: -25,
            status: BillingTransactionStatus.Completed,
            source: 'resource-usage',
          }),
          context: f.unitOfWork.scopes[0],
        },
      ]);
      expect(publishedInsideWork).toBe(false);
      expect(f.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledTimes(1);
      expect(f.email.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
    });

    it('does not publish anything when the unit of work fails', async () => {
      f.configurationStore.configure(205, { creditsPerMinute: 10 });
      jest.spyOn(f.ledgerStore, 'settleUsageCharge').mockRejectedValue(new Error('busy'));

      await expect(
        f.service.chargeForResourceUsage(
          billableUsage({ endTime: new Date('2026-09-20T09:02:00.000Z'), sessionDurationCreditsPerMinute: null }),
        ),
      ).rejects.toThrow('busy');

      expect(f.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('rejects a second charge for a usage that already has a completed one', async () => {
      await f.ledgerStore.insertTransaction({
        userId: 25,
        amount: -10,
        status: BillingTransactionStatus.Completed,
        resourceUsageId: 22,
      });

      await expect(f.service.chargeForResourceUsage(billableUsage())).rejects.toThrow(
        'Billing transaction already exists for this resource usage',
      );
      await expect(f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope())).rejects.toThrow(
        'Billing transaction already exists for this resource usage',
      );

      expect(f.ledgerStore.transactions).toHaveLength(1);
      expect(f.ledgerStore.audits).toHaveLength(0);
    });

    it.each([
      { factor: 50, amount: -20, item: -20 },
      { factor: 150, amount: -60, item: 20 },
      { factor: 0, amount: 0, item: -40 },
    ])(
      'applies a billing factor of $factor% and records it as a BILLING_FACTOR item',
      async ({ factor, amount, item }) => {
        const usage = billableUsage({
          endTime: new Date('2026-09-20T09:04:00.000Z'),
          sessionDurationCreditsPerMinute: 10,
          billingFactor: factor,
        });

        const transaction = await f.service.chargeForResourceUsage(usage, fakeTransactionScope());

        expect(transaction?.amount).toBeCloseTo(amount);
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: item, quantity: 1 }),
        );
      },
    );

    it('does not create a BILLING_FACTOR item at 100%', async () => {
      const transaction = await f.service.chargeForResourceUsage(
        billableUsage({ endTime: new Date('2026-09-20T09:04:00.000Z'), sessionDurationCreditsPerMinute: 10 }),
        fakeTransactionScope(),
      );

      expect(transaction?.amount).toBe(-40);
      expect(transaction?.items?.some((i) => i.name === 'BILLING_FACTOR')).toBe(false);
    });

    it('includes existing items in the total and completes the existing transaction', async () => {
      const pending = await f.ledgerStore.insertTransaction({
        userId: 24,
        amount: 0,
        status: BillingTransactionStatus.Pending,
        resourceUsageId: 18,
      });
      pending.items = [
        {
          id: 1,
          billingTransactionId: pending.id,
          name: 'EXTRA',
          description: null,
          externalReference: null,
          unitPrice: 7,
          quantity: 2,
          durationMs: null,
          meterQuantity: null,
          meterCreditsPerUnit: null,
          allocation: null,
        },
      ];
      const usage = billableUsage({
        id: 18,
        userId: 24,
        endTime: new Date('2026-09-20T09:02:00.000Z'),
        sessionDurationCreditsPerMinute: 5,
      });

      const transaction = await f.service.chargeForResourceUsage(usage, fakeTransactionScope());

      // 2 minutes * 5 + existing items 7 * 2 = 24
      expect(transaction).toMatchObject({ id: pending.id, amount: -24, status: BillingTransactionStatus.Completed });
      expect(f.ledgerStore.transactions).toHaveLength(1);
      expect(f.ledgerStore.audits[0].event).toEqual(
        billingTransactionAuditEvent({
          transactionId: pending.id,
          userId: 24,
          amount: -24,
          status: BillingTransactionStatus.Completed,
          previousStatus: BillingTransactionStatus.Pending,
          source: 'resource-usage',
        }),
      );
    });

    describe('a session without any charge', () => {
      /** The pending bill a session start creates for usage 22, with the given (flow or meter) items on it. */
      const pendingBill = async (items: Array<{ name: string; unitPrice: number; quantity?: number }> = []) => {
        const bill = await f.ledgerStore.insertTransaction({
          userId: 25,
          amount: 0,
          status: BillingTransactionStatus.Pending,
          resourceUsageId: 22,
        });
        bill.items = items.map((item, index) => ({
          id: index + 1,
          billingTransactionId: bill.id,
          description: null,
          externalReference: null,
          quantity: 1,
          durationMs: null,
          meterQuantity: null,
          meterCreditsPerUnit: null,
          allocation: null,
          ...item,
        }));
        return bill;
      };

      it.each([
        ['no items', []],
        ['flow items without a price', [{ name: 'Material', unitPrice: 0, quantity: 3 }]],
      ])('discards the pending bill of a session with %s and settles nothing', async (_name, items) => {
        await pendingBill(items);
        const scope = fakeTransactionScope();

        await expect(
          f.service.chargeForResourceUsage(billableUsage({ endTime: new Date('2026-09-20T09:10:00Z') }), scope),
        ).resolves.toBeUndefined();

        expect(f.ledgerStore.transactions).toHaveLength(0);
        expect(f.ledgerStore.audits).toHaveLength(0);
        // The discard joins the caller's unit of work, under the same bill lock as the read before it.
        expect(f.ledgerStore.contexts.at(-1)).toBe(scope);
      });

      it('mails nothing and, once committed, only tells open billing pages that the pending bill is gone', async () => {
        const bill = await pendingBill();

        await expect(f.service.chargeForResourceUsage(billableUsage())).resolves.toBeUndefined();

        expect(f.ledgerStore.transactions).toHaveLength(0);
        expect(f.liveNotifications.notifyTransactionRemoved).toHaveBeenCalledWith(
          expect.objectContaining({ id: bill.id, status: BillingTransactionStatus.Pending }),
        );
        expect(f.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
        expect(f.email.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
      });

      it('tells open billing pages about the discard only after the caller’s unit of work committed', async () => {
        await pendingBill();
        const scope = fakeTransactionScope();

        await f.service.chargeForResourceUsage(billableUsage(), scope);

        expect(f.liveNotifications.notifyTransactionRemoved).not.toHaveBeenCalled();
        (scope.afterCommit as jest.Mock).mock.calls.forEach(([callback]) => callback());
        expect(f.liveNotifications.notifyTransactionRemoved).toHaveBeenCalledTimes(1);
      });

      it('settles a second time without an error and without creating a bill', async () => {
        await pendingBill();

        await f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope());
        await expect(
          f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope()),
        ).resolves.toBeUndefined();

        expect(f.ledgerStore.transactions).toHaveLength(0);
      });

      it('keeps the bill of a session whose only charge is a priced item', async () => {
        const bill = await pendingBill([{ name: 'Material', unitPrice: 4, quantity: 2 }]);

        const transaction = await f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope());

        expect(transaction).toMatchObject({ id: bill.id, amount: -8, status: BillingTransactionStatus.Completed });
      });

      it('keeps a bill reduced to 0 by a 100 % billing factor, with its discount line', async () => {
        const bill = await pendingBill();

        const transaction = await f.service.chargeForResourceUsage(
          billableUsage({ creditsPerUsage: 6, billingFactor: 0 }),
          fakeTransactionScope(),
        );

        expect(transaction).toMatchObject({ id: bill.id, status: BillingTransactionStatus.Completed });
        expect(transaction?.amount).toBeCloseTo(0);
        expect(transaction?.items).toContainEqual(
          expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -6, quantity: 1 }),
        );
      });

      it('keeps a bill whose session price a negative flow item cancels out, completed at 0 with its items', async () => {
        const bill = await pendingBill([{ name: 'Member discount', unitPrice: -10 }]);

        const transaction = await f.service.chargeForResourceUsage(
          billableUsage({ creditsPerUsage: 10 }),
          fakeTransactionScope(),
        );

        expect(transaction).toMatchObject({ id: bill.id, status: BillingTransactionStatus.Completed });
        expect(transaction?.amount).toBeCloseTo(0);
        expect(transaction?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'PER_SESSION', unitPrice: 10 }),
            expect.objectContaining({ name: 'Member discount', unitPrice: -10 }),
          ]),
        );
        expect(f.liveNotifications.notifyTransactionRemoved).not.toHaveBeenCalled();
      });

      it('keeps a bill whose flow items cancel out on a resource without rates', async () => {
        const bill = await pendingBill([
          { name: 'Material', unitPrice: 5 },
          { name: 'Material refund', unitPrice: -5 },
        ]);

        const transaction = await f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope());

        expect(transaction).toMatchObject({ id: bill.id, status: BillingTransactionStatus.Completed });
        expect(transaction?.amount).toBeCloseTo(0);
        expect(transaction?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Material', unitPrice: 5 }),
            expect.objectContaining({ name: 'Material refund', unitPrice: -5 }),
          ]),
        );
        expect(f.ledgerStore.transactions).toHaveLength(1);
      });

      it('completes the bill at 0 while a priced meter reading is pending, as the anchor of its late correction', async () => {
        const bill = await pendingBill([{ name: 'Energy', unitPrice: 0 }]);
        f.ledgerStore.pendingPricedMeterUsages.add(22);

        const transaction = await f.service.chargeForResourceUsage(billableUsage(), fakeTransactionScope());

        expect(transaction).toMatchObject({ id: bill.id, status: BillingTransactionStatus.Completed });
        expect(transaction?.amount).toBeCloseTo(0);
        expect(f.ledgerStore.transactions).toHaveLength(1);
        expect(f.liveNotifications.notifyTransactionRemoved).not.toHaveBeenCalled();
      });

      it('discards the bill of a session that took no time, although it has per-minute rates', async () => {
        await pendingBill();
        const startTime = new Date('2026-09-20T09:05:00Z');

        await expect(
          f.service.chargeForResourceUsage(
            billableUsage({
              startTime,
              endTime: startTime,
              attributedOperatingDurationInMinutes: 0,
              sessionDurationCreditsPerMinute: 3,
              operatingDurationCreditsPerMinute: 7,
            }),
            fakeTransactionScope(),
          ),
        ).resolves.toBeUndefined();

        expect(f.ledgerStore.transactions).toHaveLength(0);
      });
    });
  });
});
