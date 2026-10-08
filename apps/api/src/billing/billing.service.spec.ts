/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';

import { BadRequestException } from '@nestjs/common';

import { UserNotFoundException } from './../exceptions/user.notFound.exception';

import { inheritTestScope } from './../test-utils/inherit-test-scope';

import { resetTestFixture } from './billing.service.setup.test-fixture';

import { createBillingServiceChargeForResourceUsageFixture } from './billing.service.spec.createBillingServiceChargeForResourceUsageFixture.test-fixture';

import { createBillingServiceFixture } from './billing.service.spec.createBillingServiceFixture.test-fixture';

import { InsufficientBalanceError } from './errors/insufficient-balance.error';

export type BillingServiceTestScope = ReturnType<typeof createBillingServiceFixture>;

export type BillingServiceChargeForResourceUsageTestScope = ReturnType<
  typeof createBillingServiceChargeForResourceUsageFixture
>;

describe('BillingService', () => {
  const scope = createBillingServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  describe('getTransaction', () => {
    it('restricts transaction lookup to its owner', async () => {
      scope.billingTransactionRepository.findOne.mockResolvedValue(null);

      expect(await scope.service.getTransaction(123, 2)).toBeNull();
      expect(scope.billingTransactionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 123, userId: 2 } }),
      );
    });
  });

  it.each([null, { id: 7 }])('finds only the owner’s transaction ID for a usage (%s)', async (transaction) => {
    scope.billingTransactionRepository.findOne.mockResolvedValue(transaction);
    expect(await scope.service.getTransactionIdForUsage(8, 2)).toBe(transaction?.id ?? null);
    expect(scope.billingTransactionRepository.findOne).toHaveBeenCalledWith({
      where: { resourceUsageId: 8, userId: 2 },
      select: ['id'],
    });
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
    scope.billingTransactionRepository.save.mockResolvedValue(refund);
    expect(await scope.service.refundTransaction(9, 4, { amount: 25 })).toBe(refund);
    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith({
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
    get.mockResolvedValue({ id: 4, amount: -100 } as BillingTransaction);
    await expect(scope.service.refundTransaction(9, 4, { amount: 0 })).rejects.toThrow('Amount must be greater than 0');
    await expect(scope.service.refundTransaction(9, 4, { amount: 101 })).rejects.toThrow();
    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });

  describe('getBalance', () => {
    const getBalanceScope = inheritTestScope(
      {
        get userRepository() {
          return scope.userRepository;
        },
        set userRepository(value: typeof scope.userRepository) {
          scope.userRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('returns creditBalance for existing user', async () => {
      const user = { id: 1, creditBalance: 42 } as User;
      getBalanceScope.userRepository.findOneBy.mockResolvedValue(user);

      await expect(getBalanceScope.service.getBalance(1)).resolves.toBe(42);
      expect(getBalanceScope.userRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws when user does not exist', async () => {
      getBalanceScope.userRepository.findOneBy.mockResolvedValue(null);

      await expect(getBalanceScope.service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });

  describe('getHistory', () => {
    const getHistoryScope = inheritTestScope(
      {
        get billingTransactionRepository() {
          return scope.billingTransactionRepository;
        },
        set billingTransactionRepository(value: typeof scope.billingTransactionRepository) {
          scope.billingTransactionRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('returns paginated transactions and calls repository with correct options', async () => {
      const transactions = [{ id: 10 } as BillingTransaction, { id: 9 } as BillingTransaction];
      getHistoryScope.billingTransactionRepository.findAndCount.mockResolvedValue([transactions, 2]);

      const result = await getHistoryScope.service.getHistory(7, { page: 2, limit: 10 });

      expect(result).toEqual({ data: transactions, total: 2, page: 2, limit: 10 });
      expect(getHistoryScope.billingTransactionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7 },
          skip: 10,
          take: 10,
          relations: expect.arrayContaining(['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf']),
          order: { createdAt: 'DESC', id: 'DESC' },
        }),
      );
    });
  });

  describe('createManualTransaction', () => {
    const createManualTransactionScope = inheritTestScope(
      {
        get userRepository() {
          return scope.userRepository;
        },
        set userRepository(value: typeof scope.userRepository) {
          scope.userRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get billingTransactionRepository() {
          return scope.billingTransactionRepository;
        },
        set billingTransactionRepository(value: typeof scope.billingTransactionRepository) {
          scope.billingTransactionRepository = value;
        },
        get liveNotificationsService() {
          return scope.liveNotificationsService;
        },
        set liveNotificationsService(value: typeof scope.liveNotificationsService) {
          scope.liveNotificationsService = value;
        },
        get auditService() {
          return scope.auditService;
        },
        set auditService(value: typeof scope.auditService) {
          scope.auditService = value;
        },
      },
      scope,
    );

    it('throws if user does not exist', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue(null);

      await expect(createManualTransactionScope.service.createManualTransaction(1, 2, 100)).rejects.toBeInstanceOf(
        UserNotFoundException,
      );
    });

    it('succeeds and saves the transaction when user exists', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 5 } as User);
      createManualTransactionScope.billingTransactionRepository.save.mockResolvedValue({
        id: 123,
      } as BillingTransaction);

      const result = await createManualTransactionScope.service.createManualTransaction(1, 2, 100);

      expect(createManualTransactionScope.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: 100 }),
      );
      expect(result).toEqual({ id: 123 });
      expect(createManualTransactionScope.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith({
        id: 123,
      });
      expect(createManualTransactionScope.auditService.recordBillingTransaction).toHaveBeenCalledWith({
        transactionId: 123,
        userId: 1,
        initiatorId: 2,
        amount: 100,
        status: BillingTransactionStatus.Completed,
        source: 'manual',
      });
    });

    it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

      await expect(
        createManualTransactionScope.service.createManualTransaction(1, 2, -20, true),
      ).rejects.toBeInstanceOf(InsufficientBalanceError);
    });

    it('allows negative charge when balance stays non-negative', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      createManualTransactionScope.billingTransactionRepository.save.mockResolvedValue({
        id: 456,
      } as BillingTransaction);

      const result = await createManualTransactionScope.service.createManualTransaction(1, 2, -20, true);

      expect(createManualTransactionScope.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 456 });
    });

    it('throws when amount is fractional', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      await expect(createManualTransactionScope.service.createManualTransaction(1, 2, 10.5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows negative resulting balance when failOnInsufficientBalance is false', async () => {
      createManualTransactionScope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);
      createManualTransactionScope.billingTransactionRepository.save.mockResolvedValue({
        id: 789,
      } as BillingTransaction);

      const result = await createManualTransactionScope.service.createManualTransaction(1, 2, -20, false);
      expect(createManualTransactionScope.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 789 });
    });
  });

  describe('handleResourceSessionStartedEvent', () => {
    const createMockManager = () => {
      return {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn(async () => null),
        getRepository: jest.fn(() => ({
          findOneBy: jest.fn().mockResolvedValue(null),
          create: jest.fn((data: unknown) => data),
          save: jest.fn(async (data: unknown) => data),
        })),
        save: jest.fn(async (_entity: unknown, data: any) => ({ id: 999, ...data })),
        update: jest.fn(async () => undefined),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        getRepository: jest.Mock;
        save: jest.Mock;
        update: jest.Mock;
      };
    };
    const handleResourceSessionStartedEventScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get createMockManager() {
          return createMockManager;
        },
        get billingTransactionRepository() {
          return scope.billingTransactionRepository;
        },
        set billingTransactionRepository(value: typeof scope.billingTransactionRepository) {
          scope.billingTransactionRepository = value;
        },
        get liveNotificationsService() {
          return scope.liveNotificationsService;
        },
        set liveNotificationsService(value: typeof scope.liveNotificationsService) {
          scope.liveNotificationsService = value;
        },
        get emailService() {
          return scope.emailService;
        },
        set emailService(value: typeof scope.emailService) {
          scope.emailService = value;
        },
        get auditService() {
          return scope.auditService;
        },
        set auditService(value: typeof scope.auditService) {
          scope.auditService = value;
        },
      },
      scope,
    );

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
      jest.spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration').mockResolvedValue({
        creditsPerUsage: 99,
        creditsPerMinute: 99,
        creditsPerOperatingMinute: 99,
      } as ResourceBillingConfiguration);
      const manager = handleResourceSessionStartedEventScope.createMockManager();

      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage,
        manager as never,
      );

      expect(transaction.amount).toBe(-contract.expectedCharge);
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'PER_SESSION', unitPrice: contract.creditsPerUsage, quantity: 1 }),
      );
      if (contract.billingFactor !== 100) {
        expect(manager.save).toHaveBeenCalledWith(
          BillingTransactionItem,
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
          .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
          .mockResolvedValue({} as ResourceBillingConfiguration);
        const manager = handleResourceSessionStartedEventScope.createMockManager();
        const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
          usage,
          manager as never,
        );
        expect(transaction.amount).toBe(-amount);
        expect(manager.save).toHaveBeenCalledWith(
          BillingTransactionItem,
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
          .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
          .mockResolvedValue({ creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration);
        const manager = handleResourceSessionStartedEventScope.createMockManager();
        manager.findOne.mockResolvedValue({ id: 999, items: [], status: BillingTransactionStatus.Pending });

        const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
          usage,
          manager as never,
        );

        expect(transaction.amount).toBe(-roundedMinutes * 10);
        expect(manager.save).toHaveBeenCalledWith(
          BillingTransactionItem,
          expect.objectContaining({
            name: 'PER_MINUTE',
            durationMs,
            quantity: roundedMinutes,
            unitPrice: 3,
          }),
        );
        expect(manager.save).toHaveBeenCalledWith(
          BillingTransactionItem,
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        handleResourceSessionStartedEventScope.createMockManager() as any,
      );

      expect(handleResourceSessionStartedEventScope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(
        99,
        expect.any(Object),
      );
      expect(handleResourceSessionStartedEventScope.billingTransactionRepository.save).not.toHaveBeenCalled();
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        handleResourceSessionStartedEventScope.createMockManager() as any,
      );

      expect(handleResourceSessionStartedEventScope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(
        100,
        expect.any(Object),
      );
      expect(handleResourceSessionStartedEventScope.billingTransactionRepository.save).not.toHaveBeenCalled();
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        handleResourceSessionStartedEventScope.createMockManager() as any,
      );

      expect(handleResourceSessionStartedEventScope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(
        101,
        expect.any(Object),
      );
      expect(handleResourceSessionStartedEventScope.billingTransactionRepository.save).not.toHaveBeenCalled();
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      handleResourceSessionStartedEventScope.billingTransactionRepository.save.mockResolvedValue({
        id: 999,
      } as BillingTransaction);

      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        handleResourceSessionStartedEventScope.createMockManager() as any,
      );

      expect(handleResourceSessionStartedEventScope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(
        102,
        expect.any(Object),
      );
      // A caller-owned transaction returns the charge without publishing it before commit.
      expect(transaction).toEqual(expect.objectContaining({ id: 999, amount: -35, userId: 10, resourceUsageId: 13 }));
      expect(
        handleResourceSessionStartedEventScope.liveNotificationsService.notifyTransactionUpdate,
      ).not.toHaveBeenCalled();
      expect(
        handleResourceSessionStartedEventScope.emailService.sendResourceUsageBillingSummaryEmail,
      ).not.toHaveBeenCalled();
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // Custom manager to capture saves/updates
      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1001, ...data };
            }
            return data;
          }),
        getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
        getRepository: jest.Mock;
      };

      // ceil(2) = 2 -> 2 * 20 + 0 = 40 credits; billingFactor 50% -> 20
      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        manager as unknown as never,
      );

      expect(handleResourceSessionStartedEventScope.service.getResourceBillingConfiguration).toHaveBeenCalledWith(
        200,
        expect.any(Object),
      );
      expect(transaction).toEqual(expect.objectContaining({ amount: -20 }));

      // Ensure BILLING_FACTOR item saved with the discount as a negative unit price
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -20, quantity: 1 }),
      );

      // Ensure base items were saved
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'PER_SESSION', unitPrice: 0, quantity: 1 }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1002, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // ceil(3) = 3 -> 3 * 10 + 5 = 35 credits; 100% factor -> 35
      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        manager as unknown as never,
      );
      expect(transaction.amount).toBe(-35);

      const saves = (manager.save as jest.Mock).mock.calls
        .map(([, data]: any[]) => data);
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1003, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = 20, factor 150% -> total 30, surcharge item +10
      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        manager as unknown as never,
      );

      expect(transaction).toEqual(expect.objectContaining({ amount: -30 }));

      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1004, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = 30, factor 0% -> total 0
      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        manager as unknown as never,
      );

      // Handle -0 vs 0 by checking numerically
      expect(transaction).toBeDefined();
      expect(transaction.amount).toBeCloseTo(0);

      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
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
        .spyOn(handleResourceSessionStartedEventScope.service, 'getResourceBillingConfiguration')
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

      const manager = {
        // No existing completed transaction
        findOneBy: jest.fn().mockResolvedValue(null),
        // Existing pending transaction returned with items
        findOne: jest.fn().mockResolvedValue(existingTransaction),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockImplementation(async (_entity: unknown, data: unknown) => data),
      } as unknown as {
        findOneBy: jest.Mock;
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = ceil(2) * 5 = 10; plus existing items 14 => 24; factor 100% -> 24
      const transaction = await handleResourceSessionStartedEventScope.service.chargeForResourceUsage(
        usage as ResourceUsage,
        manager as unknown as never,
      );

      expect(manager.update).toHaveBeenCalledWith(BillingTransaction, 77, expect.objectContaining({ amount: -24 }));
      expect(transaction).toEqual(expect.objectContaining({ id: 77, amount: -24 }));
      expect(
        handleResourceSessionStartedEventScope.auditService.recordBillingTransactionAfterCommit,
      ).toHaveBeenCalledWith(
        {
          transactionId: 77,
          userId: 24,
          amount: -24,
          status: BillingTransactionStatus.Completed,
          previousStatus: BillingTransactionStatus.Pending,
          source: 'resource-usage',
        },
        manager,
      );

      // No BILLING_FACTOR item because billingFactor is 100%
      const saves = (manager.save as jest.Mock).mock.calls
        .map(([, data]: any[]) => data);
      const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
      expect(hasBillingFactor).toBe(false);
    });
  });
});
