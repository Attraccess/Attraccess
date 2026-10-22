import { AUDIT_COMMIT_BOUNDARY, AuditCommitBoundary } from '../../audit/persistence/port';
import { TransactionScope } from '../../database/transaction-scope';

import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/application-models';

import { BadRequestException } from '@nestjs/common';

import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

import { billingOperationsFake, billingTransactionsFake } from './fixtures/operations.test-fixture';
import { BillingPersistence } from '../persistence/port';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createBillingServiceFixture } from './fixtures/service.test-fixture';

import { InsufficientBalanceError } from '../errors/insufficient-balance.error';

export type BillingServiceTestScope = ReturnType<typeof createBillingServiceFixture>;

describe('BillingService', () => {
  const scope = createBillingServiceFixture();

  function withBillingScope<T>(
    usage: ResourceUsage,
    operations: BillingPersistence,
    work: (scope: TransactionScope) => Promise<T>,
  ): Promise<T> {
    scope.transactionDriver.setOperations(operations);
    return scope.transactionDriver.transactions.run(
      { resourceIds: [usage.resourceId ?? usage.resource.id], accountIds: usage.userId == null ? [] : [usage.userId] },
      work,
    );
  }

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  it.each(['resource', 'account', 'foreign', 'closed'])(
    'rejects a %s parent before billing reads or writes',
    async (kind) => {
      const usage = { id: 3, resourceId: 7, resource: { id: 7 }, userId: 9 } as ResourceUsage;
      const owner =
        kind === 'foreign'
          ? billingTransactionsFake(scope.persistence).transactions
          : scope.transactionDriver.transactions;
      const conflicts = { resourceIds: [kind === 'resource' ? 8 : 7], accountIds: [kind === 'account' ? 10 : 9] };
      if (kind === 'closed') {
        const parent = await owner.run(conflicts, async (parent) => parent);
        await expect(scope.service.chargeForResourceUsage(usage, parent)).rejects.toThrow('Invalid parent');
      } else {
        await owner.run(conflicts, async (parent) => {
          await expect(scope.service.chargeForResourceUsage(usage, parent)).rejects.toThrow(
            kind === 'foreign' ? 'Invalid parent' : 'cannot expand',
          );
        });
      }
      for (const operation of Object.values(scope.persistence)) expect(operation).not.toHaveBeenCalled();
      expect(scope.auditService.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
    },
  );

  describe('getTransaction', () => {
    it('restricts transaction lookup to its owner', async () => {
      scope.persistence.transaction.mockResolvedValue(null);

      expect(await scope.service.getTransaction(123, 2)).toBeNull();
      expect(scope.persistence.transaction).toHaveBeenCalledWith(123, 2);
    });
  });

  it.each([null, 7])('finds only the owner’s transaction ID for a usage (%s)', async (id) => {
    scope.persistence.transactionIdForUsage.mockResolvedValue(id);
    expect(await scope.service.getTransactionIdForUsage(8, 2)).toBe(id);
    expect(scope.persistence.transactionIdForUsage).toHaveBeenCalledWith(8, 2);
  });

  it.each([100, -100])('creates an opposite-sign refund for transaction amount %s', async (amount) => {
    const original = { id: 4, userId: 7, amount } as BillingTransaction;
    const refund = {
      id: 5,
      userId: 7,
      amount: amount > 0 ? -25 : 25,
      status: BillingTransactionStatus.Completed,
    } as BillingTransaction;
    jest.spyOn(scope.service, 'getTransaction').mockResolvedValueOnce(original).mockResolvedValueOnce(refund);
    scope.persistence.createTransaction.mockResolvedValue(refund);
    scope.persistence.transaction.mockResolvedValue(original);
    expect(await scope.service.refundTransaction(9, 4, { amount: 25 })).toEqual(refund);
    expect(scope.persistence.createTransaction).toHaveBeenCalledWith({
      userId: 7,
      initiatorId: 9,
      amount: refund.amount,
      status: BillingTransactionStatus.Completed,
      refundOfId: 4,
    });
    expect(scope.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(refund);
    expect(scope.auditService.recordBillingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 5, source: 'refund', amount: refund.amount }),
    );
  });

  it('rejects absent transactions and invalid refund amounts before writing', async () => {
    const get = jest.spyOn(scope.service, 'getTransaction').mockResolvedValue(null);
    await expect(scope.service.refundTransaction(9, 4, { amount: 25 })).rejects.toThrow();
    get.mockResolvedValue({ id: 4, userId: 7, amount: -100 } as BillingTransaction);
    scope.persistence.transaction.mockResolvedValue({ id: 4, userId: 7, amount: -100 });
    await expect(scope.service.refundTransaction(9, 4, { amount: 0 })).rejects.toThrow('Amount must be greater than 0');
    await expect(scope.service.refundTransaction(9, 4, { amount: 101 })).rejects.toThrow();
    expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });

  describe('getBalance', () => {
    it('returns creditBalance for existing user', async () => {
      const user = { id: 1, creditBalance: 42 } as User;
      scope.persistence.balance.mockResolvedValue(user);

      await expect(scope.service.getBalance(1)).resolves.toBe(42);
      expect(scope.persistence.balance).toHaveBeenCalledWith(1);
    });

    it('throws when user does not exist', async () => {
      scope.persistence.balance.mockResolvedValue(null);

      await expect(scope.service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns paginated transactions through the history operation', async () => {
      const transactions = [{ id: 10 } as BillingTransaction, { id: 9 } as BillingTransaction];
      scope.persistence.history.mockResolvedValue([transactions, 2]);

      const result = await scope.service.getHistory(7, { page: 2, limit: 10 });

      expect(result).toEqual({ data: transactions, total: 2, page: 2, limit: 10 });
      expect(scope.persistence.history).toHaveBeenCalledWith(7, 10, 10);
    });
  });

  describe('createManualTransaction', () => {
    it('throws if user does not exist', async () => {
      scope.persistence.balance.mockResolvedValue(null);

      await expect(scope.service.createManualTransaction(1, 2, 100)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('succeeds and saves the transaction when user exists', async () => {
      scope.persistence.balance.mockResolvedValue({ id: 1, creditBalance: 5 } as User);
      scope.persistence.createTransaction.mockResolvedValue({
        id: 123,
      } as BillingTransaction);

      const result = await scope.service.createManualTransaction(1, 2, 100);

      expect(scope.persistence.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: 100 }),
      );
      expect(result).toEqual({ id: 123 });
      expect(scope.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith({
        id: 123,
      });
      expect(scope.auditService.recordBillingTransaction).toHaveBeenCalledWith({
        transactionId: 123,
        userId: 1,
        initiatorId: 2,
        amount: 100,
        status: BillingTransactionStatus.Completed,
        source: 'manual',
      });
    });

    it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
      scope.persistence.balance.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

      await expect(scope.service.createManualTransaction(1, 2, -20, true)).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    it('allows negative charge when balance stays non-negative', async () => {
      scope.persistence.balance.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      scope.persistence.createTransaction.mockResolvedValue({
        id: 456,
      } as BillingTransaction);

      const result = await scope.service.createManualTransaction(1, 2, -20, true);

      expect(scope.persistence.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 456 });
    });

    it('throws when amount is fractional', async () => {
      scope.persistence.balance.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      await expect(scope.service.createManualTransaction(1, 2, 10.5)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows negative resulting balance when failOnInsufficientBalance is false', async () => {
      scope.persistence.balance.mockResolvedValue({ id: 1, creditBalance: 10 } as User);
      scope.persistence.createTransaction.mockResolvedValue({
        id: 789,
      } as BillingTransaction);

      const result = await scope.service.createManualTransaction(1, 2, -20, false);
      expect(scope.persistence.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 789 });
    });
  });

  describe('handleResourceSessionStartedEvent', () => {
    it.each([
      { creditsPerUsage: 6, billingFactor: 50, expectedCharge: 15 },
      { creditsPerUsage: 0, billingFactor: 100, expectedCharge: 24 },
      { creditsPerUsage: 6, billingFactor: 0, expectedCharge: 0 },
    ])('charges the complete start-time contract ($creditsPerUsage fixed, $billingFactor%)', async (contract) => {
      const usage = {
        id: 22,
        startTime: new Date('2026-09-20T09:00:00Z'),
        endTime: new Date('2026-09-20T09:02:00Z'),
        usageInMinutes: 2,
        attributedOperatingDurationInMinutes: 1,
        sessionDurationCreditsPerMinute: 10,
        operatingDurationCreditsPerMinute: 4,
        creditsPerUsage: contract.creditsPerUsage,
        billingFactor: contract.billingFactor,
        resource: { id: 205 },
        userId: 25,
        user: { id: 25, billingFactor: 200 },
      } as ResourceUsage;
      jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 99,
        creditsPerMinute: 99,
        creditsPerOperatingMinute: 99,
      } as ResourceBillingConfiguration);
      const operations = billingOperationsFake();

      const transaction = await withBillingScope(usage, operations, (transaction) =>
        scope.service.chargeForResourceUsage(usage, transaction),
      );

      expect(transaction.amount).toBe(-contract.expectedCharge);
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'PER_SESSION', unitPrice: contract.creditsPerUsage, quantity: 1 }),
      );
      if (contract.billingFactor !== 100) {
        expect(operations.saveItem).toHaveBeenCalledWith(
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
        const usage = {
          id: 22,
          startTime: new Date('2026-09-20T09:00:00Z'),
          endTime: new Date('2026-09-20T09:00:00Z'),
          creditsPerUsage: charge,
          sessionDurationCreditsPerMinute: 0,
          operatingDurationCreditsPerMinute: 0,
          billingFactor: factor,
          resource: { id: 205 },
          userId: 25,
          user: { id: 25, billingFactor: 100 },
        } as ResourceUsage;
        jest
          .spyOn(scope.service, 'getResourceBillingConfiguration')
          .mockResolvedValue({} as ResourceBillingConfiguration);
        const operations = billingOperationsFake();
        const transaction = await withBillingScope(usage, operations, (transaction) =>
          scope.service.chargeForResourceUsage(usage, transaction),
        );
        expect(transaction.amount).toBe(-amount);
        expect(operations.saveItem).toHaveBeenCalledWith(
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
        const usage = {
          id: 22,
          startTime,
          endTime: new Date(startTime.getTime() + durationMs),
          // SQLite's generated Julian-day duration can be just above an exact minute.
          usageInMinutes: durationMs === 60_000 ? 1.000000610947609 : durationMs / 60_000,
          attributedOperatingDurationInMinutes: durationMs / 60_000,
          sessionDurationCreditsPerMinute: 3,
          operatingDurationCreditsPerMinute: 7,
          creditsPerUsage: 0,
          billingFactor: 100,
          resource: { id: 205 },
          userId: 25,
        } as ResourceUsage;
        jest
          .spyOn(scope.service, 'getResourceBillingConfiguration')
          .mockResolvedValue({ creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration);
        const operations = billingOperationsFake();
        operations.usageTransactionWithItems.mockResolvedValue({
          id: 999,
          items: [],
          status: BillingTransactionStatus.Pending,
        });

        const transaction = await withBillingScope(usage, operations, (transaction) =>
          scope.service.chargeForResourceUsage(usage, transaction),
        );

        expect(transaction.amount).toBe(-roundedMinutes * 10);
        expect(operations.saveItem).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'PER_MINUTE',
            durationMs,
            quantity: roundedMinutes,
            unitPrice: 3,
          }),
        );
        expect(operations.saveItem).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
            durationMs,
            quantity: roundedMinutes,
            unitPrice: 7,
          }),
        );
      },
    );

    it('processes non-Usage actions without creating a transaction when credits are zero', async () => {
      const usage = {
        id: 10,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date('2026-09-20T09:07:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 3,
        resource: { id: 99 },
        userId: 7,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await withBillingScope(usage as ResourceUsage, billingOperationsFake(), (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(99, expect.any(Object));
      expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
    });

    it('processes not-ended session without creating a transaction when credits are zero', async () => {
      const usage = {
        id: 11,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        usageInMinutes: -1,
        resource: { id: 100 },
        userId: 8,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await withBillingScope(usage as ResourceUsage, billingOperationsFake(), (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(100, expect.any(Object));
      expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
    });

    it('does nothing when computed credits are zero', async () => {
      const usage = {
        id: 12,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:05:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 5,
        resource: { id: 101 },
        userId: 9,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await withBillingScope(usage as ResourceUsage, billingOperationsFake(), (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(101, expect.any(Object));
      expect(scope.persistence.createTransaction).not.toHaveBeenCalled();
    });

    it('creates a negative billing transaction when credits > 0', async () => {
      const usage = {
        id: 13,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:07:36.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 2.4,
        resource: { id: 102 },
        userId: 10,
        user: {
          id: 10,
          billingFactor: 100,
        } as User,
      } as unknown as ResourceUsage;

      // ceil(2.4) = 3 -> 3 * 10 + 5 = 35 credits
      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      scope.persistence.createTransaction.mockResolvedValue({
        id: 999,
      } as BillingTransaction);

      const transaction = await withBillingScope(usage as ResourceUsage, billingOperationsFake(), (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(102, expect.any(Object));
      // A caller-owned transaction returns the charge without publishing it before commit.
      expect(transaction).toEqual(expect.objectContaining({ id: 999, amount: -35, userId: 10, resourceUsageId: 13 }));
      expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
      expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
    });

    it('applies billingFactor < 100% (discount) and creates BILLING_FACTOR item', async () => {
      const usage = {
        id: 14,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:08:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 2,
        resource: { id: 200 },
        userId: 20,
        user: {
          id: 20,
          billingFactor: 50,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // Operation fake captures ledger writes
      const operations = billingOperationsFake();

      // ceil(2) = 2 -> 2 * 20 + 0 = 40 credits; billingFactor 50% -> 20
      const transaction = await withBillingScope(usage as ResourceUsage, operations, (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(scope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(200, expect.any(Object));
      expect(transaction).toEqual(expect.objectContaining({ amount: -20 }));

      // Ensure BILLING_FACTOR item saved with the discount as a negative unit price
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -20, quantity: 1 }),
      );

      // Ensure base items were saved
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'PER_SESSION', unitPrice: 0, quantity: 1 }),
      );
      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 20, quantity: 2 }),
      );
    });

    it('does not create BILLING_FACTOR item when billingFactor is 100%', async () => {
      const usage = {
        id: 15,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:07:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 3,
        resource: { id: 201 },
        userId: 21,
        user: {
          id: 21,
          billingFactor: 100,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      const operations = billingOperationsFake();

      // ceil(3) = 3 -> 3 * 10 + 5 = 35 credits; 100% factor -> 35
      const transaction = await withBillingScope(usage as ResourceUsage, operations, (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );
      expect(transaction.amount).toBe(-35);

      const saves = (operations.saveItem as jest.Mock).mock.calls.map(([data]) => data);
      const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
      expect(hasBillingFactor).toBe(false);
    });

    it('applies billingFactor > 100% (surcharge) and creates positive BILLING_FACTOR item', async () => {
      const usage = {
        id: 16,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:09:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 1,
        resource: { id: 202 },
        userId: 22,
        user: {
          id: 22,
          billingFactor: 150,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const operations = billingOperationsFake();

      // base = 20, factor 150% -> total 30, surcharge item +10
      const transaction = await withBillingScope(usage as ResourceUsage, operations, (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      expect(transaction).toEqual(expect.objectContaining({ amount: -30 }));

      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: 10, quantity: 1 }),
      );
    });

    it('creates zero-amount transaction when billingFactor is 0% and inserts a negative BILLING_FACTOR item', async () => {
      const usage = {
        id: 17,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:07:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 3,
        resource: { id: 203 },
        userId: 23,
        user: {
          id: 23,
          billingFactor: 0,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const operations = billingOperationsFake();

      // base = 30, factor 0% -> total 0
      const transaction = await withBillingScope(usage as ResourceUsage, operations, (transaction) =>
        scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction),
      );

      // Handle -0 vs 0 by checking numerically
      expect(transaction).toBeDefined();
      expect(transaction.amount).toBeCloseTo(0);

      expect(operations.saveItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -30, quantity: 1 }),
      );
    });

    it('includes existing transaction items in total and updates existing transaction', async () => {
      const usage = {
        id: 18,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-09-20T09:08:00.000Z'),
        endTime: new Date('2026-09-20T09:10:00.000Z'),
        usageInMinutes: 2,
        resource: { id: 204 },
        userId: 24,
        user: {
          id: 24,
          billingFactor: 100,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(scope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 5, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // Existing pending transaction with additional items worth 14 (7 * 2)
      const existingTransaction = {
        id: 77,
        userId: 24,
        status: BillingTransactionStatus.Pending,
        items: [
          {
            unitPrice: 7,
            quantity: 2,
          },
        ],
      } as unknown as BillingTransaction;

      const operations = billingOperationsFake();
      operations.usageTransactionWithItems.mockResolvedValue(existingTransaction);

      // base = ceil(2) * 5 = 10; plus existing items 14 => 24; factor 100% -> 24
      let owningAuditBoundary: AuditCommitBoundary;
      const transaction = await withBillingScope(usage as ResourceUsage, operations, (transaction) => {
        owningAuditBoundary = transaction.resolve(AUDIT_COMMIT_BOUNDARY);
        expect(owningAuditBoundary.defer).toEqual(expect.any(Function));
        return scope.service.chargeForResourceUsage(usage as ResourceUsage, transaction);
      });

      expect(operations.completeTransaction).toHaveBeenCalledWith(77, -24);
      expect(transaction).toEqual(expect.objectContaining({ id: 77, amount: -24 }));
      const [auditEvent, auditBoundary] = scope.auditService.recordBillingTransactionAfterCommit.mock.calls[0];
      expect(auditEvent).toEqual({
        transactionId: 77,
        userId: 24,
        amount: -24,
        status: BillingTransactionStatus.Completed,
        previousStatus: BillingTransactionStatus.Pending,
        source: 'resource-usage',
      });
      expect(auditBoundary).toBe(owningAuditBoundary);

      // No BILLING_FACTOR item because billingFactor is 100%
      const saves = (operations.saveItem as jest.Mock).mock.calls.map(([data]) => data);
      const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
      expect(hasBillingFactor).toBe(false);
    });
  });
});
