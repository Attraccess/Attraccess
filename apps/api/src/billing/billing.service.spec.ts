import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from './billing.service';
import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  Setting,
  BillingTransactionItem,
  Resource,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { LiveNotificationsService } from './liveNotificationsService';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { BadRequestException } from '@nestjs/common';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { Currency } from './dto/set-configuration.dto';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { EmailService } from '../email/email.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../metrics/metrics.service';

const mockMetricsService = {
  billingTransactionsTotal: { inc: jest.fn() },
  billingTransactionAmount: { observe: jest.fn() },
};

describe('BillingService', () => {
  let service: BillingService;
  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let settingRepository: jest.Mocked<Repository<Setting>>;
  let resourceBillingConfigurationRepository: jest.Mocked<Repository<ResourceBillingConfiguration>>;
  let liveNotificationsService: { notifyTransactionUpdate: jest.Mock };
  let emailService: jest.Mocked<EmailService>;
  let billingTransactionItemRepository: jest.Mocked<Repository<BillingTransactionItem>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: LiveNotificationsService, useValue: { notifyTransactionUpdate: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        // Provide BillingTransactionItem repo with a manager.transaction for internal use
        {
          provide: getRepositoryToken(BillingTransactionItem),
          useValue: {
            manager: {
              transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) =>
                cb({
                  findOneBy: jest.fn(),
                  getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
                  save: jest.fn(async (_e: string, data: unknown) => data),
                }),
              ),
            },
          },
        },
        {
          provide: getRepositoryToken(BillingTransaction),
          useValue: {
            findAndCount: jest.fn(),
            findOneBy: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ResourceBillingConfiguration),
          useValue: {
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Setting),
          useValue: {
            findOneBy: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ResourceFlowsExecutorService,
          useValue: { runFlow: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ResourceFlowsService,
          useValue: { getNodes: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EmailService,
          useValue: { sendBillingTransactionEmail: jest.fn(), sendResourceUsageBillingSummaryEmail: jest.fn() },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get(BillingService);
    billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction)) as jest.Mocked<
      Repository<BillingTransaction>
    >;
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
    settingRepository = module.get(getRepositoryToken(Setting)) as jest.Mocked<Repository<Setting>>;
    resourceBillingConfigurationRepository = module.get(
      getRepositoryToken(ResourceBillingConfiguration),
    ) as jest.Mocked<Repository<ResourceBillingConfiguration>>;
    liveNotificationsService = module.get(LiveNotificationsService);
    emailService = module.get(EmailService);
    billingTransactionItemRepository = module.get(getRepositoryToken(BillingTransactionItem)) as jest.Mocked<
      Repository<BillingTransactionItem>
    >;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalance', () => {
    it('returns creditBalance for existing user', async () => {
      const user = { id: 1, creditBalance: 42 } as User;
      userRepository.findOneBy.mockResolvedValue(user);

      await expect(service.getBalance(1)).resolves.toBe(42);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws when user does not exist', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns paginated transactions and calls repository with correct options', async () => {
      const transactions = [{ id: 10 } as BillingTransaction, { id: 9 } as BillingTransaction];
      billingTransactionRepository.findAndCount.mockResolvedValue([transactions, 2]);

      const result = await service.getHistory(7, { page: 2, limit: 10 });

      expect(result).toEqual({ data: transactions, total: 2, page: 2, limit: 10 });
      expect(billingTransactionRepository.findAndCount).toHaveBeenCalledWith(
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
    it('throws if user does not exist', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(service.createManualTransaction(1, 2, 100)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('succeeds and saves the transaction when user exists', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 5 } as User);
      billingTransactionRepository.save.mockResolvedValue({ id: 123 } as BillingTransaction);

      const result = await service.createManualTransaction(1, 2, 100);

      expect(billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: 100 }),
      );
      expect(result).toEqual({ id: 123 });
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith({ id: 123 });
    });

    it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

      await expect(service.createManualTransaction(1, 2, -20, true)).rejects.toBeInstanceOf(InsufficientBalanceError);
    });

    it('allows negative charge when balance stays non-negative', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      billingTransactionRepository.save.mockResolvedValue({ id: 456 } as BillingTransaction);

      const result = await service.createManualTransaction(1, 2, -20, true);

      expect(billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 456 });
    });

    it('throws when amount is fractional', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      await expect(service.createManualTransaction(1, 2, 10.5)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows negative resulting balance when failOnInsufficientBalance is false', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);
      billingTransactionRepository.save.mockResolvedValue({ id: 789 } as BillingTransaction);

      const result = await service.createManualTransaction(1, 2, -20, false);
      expect(billingTransactionRepository.save).toHaveBeenCalledWith(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        save: jest.fn(async (_entity: unknown, data: any) => ({ id: 999, ...data })),
        update: jest.fn(async () => undefined),
      } as unknown as {
        findOneBy: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        getRepository: jest.Mock;
        save: jest.Mock;
        update: jest.Mock;
      };
    };

    it('processes non-Usage actions without creating a transaction when credits are zero', async () => {
      const usage = {
        id: 10,
        usageAction: ResourceUsageAction.DoorLock,
        endTime: new Date(),
        usageInMinutes: 3,
        resource: { id: 99 },
        userId: 7,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.chargeForResourceUsage(usage as ResourceUsage, createMockManager() as any);

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(99, expect.any(Object));
      expect(billingTransactionRepository.save).not.toHaveBeenCalled();
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
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.chargeForResourceUsage(usage as ResourceUsage, createMockManager() as any);

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(100, expect.any(Object));
      expect(billingTransactionRepository.save).not.toHaveBeenCalled();
    });

    it('does nothing when computed credits are zero', async () => {
      const usage = {
        id: 12,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
        usageInMinutes: 5,
        resource: { id: 101 },
        userId: 9,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.chargeForResourceUsage(usage as ResourceUsage, createMockManager() as any);

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(101, expect.any(Object));
      expect(billingTransactionRepository.save).not.toHaveBeenCalled();
    });

    it('creates a negative billing transaction when credits > 0', async () => {
      const usage = {
        id: 13,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
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
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      billingTransactionRepository.save.mockResolvedValue({ id: 999 } as BillingTransaction);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.chargeForResourceUsage(usage as ResourceUsage, createMockManager() as any);

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(102, expect.any(Object));
      // Transaction is created via provided manager; notification is emitted with full transaction
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 999, amount: -35, userId: 10, resourceUsageId: 13 }),
      );
    });

    it('applies billingFactor < 100% (discount) and creates BILLING_FACTOR item', async () => {
      const usage = {
        id: 14,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
        usageInMinutes: 2,
        resource: { id: 200 },
        userId: 20,
        user: {
          id: 20,
          billingFactor: 50,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // Custom manager to capture saves/updates
      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1001, ...data };
            }
            return data;
          }),
        getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
      } as unknown as {
        findOneBy: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
        getRepository: jest.Mock;
      };

      // ceil(2) = 2 -> 2 * 20 + 0 = 40 credits; billingFactor 50% -> 20
      await service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(200, expect.any(Object));
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -20 }),
      );

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
        endTime: new Date(),
        usageInMinutes: 3,
        resource: { id: 201 },
        userId: 21,
        user: {
          id: 21,
          billingFactor: 100,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1002, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // ceil(3) = 3 -> 3 * 10 + 5 = 35 credits; 100% factor -> 35
      await service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

      const saves = (manager.save as jest.Mock).mock.calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(([, data]: any[]) => data);
      const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
      expect(hasBillingFactor).toBe(false);
    });

    it('applies billingFactor > 100% (surcharge) and creates positive BILLING_FACTOR item', async () => {
      const usage = {
        id: 16,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
        usageInMinutes: 1,
        resource: { id: 202 },
        userId: 22,
        user: {
          id: 22,
          billingFactor: 150,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1003, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = 20, factor 150% -> total 30, surcharge item +10
      await service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -30 }),
      );

      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: 10, quantity: 1 }),
      );
    });

    it('creates zero-amount transaction when billingFactor is 0% and inserts a negative BILLING_FACTOR item', async () => {
      const usage = {
        id: 17,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
        usageInMinutes: 3,
        resource: { id: 203 },
        userId: 23,
        user: {
          id: 23,
          billingFactor: 0,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest
          .fn()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(async (entity: unknown, data: any) => {
            if (data && 'status' in data && 'amount' in data) {
              return { id: 1004, ...data };
            }
            return data;
          }),
      } as unknown as {
        findOneBy: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = 30, factor 0% -> total 0
      await service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

      // Handle -0 vs 0 by checking numerically
      const notifiedTx = (liveNotificationsService.notifyTransactionUpdate as jest.Mock).mock.calls.at(-1)[0];
      expect(notifiedTx).toBeDefined();
      expect(notifiedTx.amount).toBeCloseTo(0);

      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -30, quantity: 1 }),
      );
    });

    it('includes existing transaction items in total and updates existing transaction', async () => {
      const usage = {
        id: 18,
        usageAction: ResourceUsageAction.Usage,
        endTime: new Date(),
        usageInMinutes: 2,
        resource: { id: 204 },
        userId: 24,
        user: {
          id: 24,
          billingFactor: 100,
        } as User,
      } as unknown as ResourceUsage;

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 5, creditsPerUsage: 0 } as ResourceBillingConfiguration);

      // Existing pending transaction with additional items worth 14 (7 * 2)
      const existingTransaction = {
        id: 77,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.Mock<any, any>;
        update: jest.Mock;
        save: jest.Mock;
      };

      // base = ceil(2) * 5 = 10; plus existing items 14 => 24; factor 100% -> 24
      await service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);

      expect(manager.update).toHaveBeenCalledWith(BillingTransaction, 77, expect.objectContaining({ amount: -24 }));
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 77, amount: -24 }),
      );

      // No BILLING_FACTOR item because billingFactor is 100%
      const saves = (manager.save as jest.Mock).mock.calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(([, data]: any[]) => data);
      const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
      expect(hasBillingFactor).toBe(false);
    });
  });

  describe('getResourceBillingConfiguration', () => {
    it('creates and saves default configuration when none exists', async () => {
      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      const created = { resourceId: 42, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      resourceBillingConfigurationRepository.create.mockReturnValue(created);
      resourceBillingConfigurationRepository.save.mockResolvedValue(created);

      const result = await service.getResourceBillingConfiguration(42);
      expect(resourceBillingConfigurationRepository.create).toHaveBeenCalledWith({
        resourceId: 42,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
      expect(resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('returns existing configuration when present', async () => {
      const existing = { resourceId: 7, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;
      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(existing);

      const result = await service.getResourceBillingConfiguration(7);
      expect(resourceBillingConfigurationRepository.findOneBy).toHaveBeenCalledWith({ resourceId: 7 });
      expect(result).toBe(existing);
    });

    it('charges both snapped duration rates without changing legacy session-duration charging', async () => {
      const usage = {
        id: 22,
        endTime: new Date(),
        usageInMinutes: 2.1,
        attributedOperatingDurationInMinutes: 1.1,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
        resource: { id: 205 },
        userId: 25,
        user: { id: 25, billingFactor: 100 } as User,
      } as ResourceUsage;
      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 99, creditsPerUsage: 0 } as ResourceBillingConfiguration);
      const manager = {
        findOneBy: jest.fn().mockResolvedValue(null),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(async (_entity: unknown, data: Record<string, unknown>) =>
          'amount' in data ? { id: 1005, ...data } : data,
        ),
      } as unknown as never;

      await service.chargeForResourceUsage(usage, manager);

      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -23 }),
      );
      expect((manager as { save: jest.Mock }).save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 3, quantity: 3 }),
      );
      expect((manager as { save: jest.Mock }).save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE', unitPrice: 7, quantity: 2 }),
      );
    });
  });

  describe('updateResourceBillingConfiguration', () => {
    it('throws when configuration not found', async () => {
      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
      await expect(
        service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1, creditsPerMinute: 1 }),
      ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
    });

    it('throws when creditsPerMinute is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(service.updateResourceBillingConfiguration(1, { creditsPerMinute: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when creditsPerUsage is negative', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      await expect(service.updateResourceBillingConfiguration(1, { creditsPerUsage: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('coerces nulls to 0 and saves', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 5, creditsPerMinute: 6 } as ResourceBillingConfiguration;

      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await service.updateResourceBillingConfiguration(1, {
        creditsPerUsage: null,
        creditsPerMinute: null,
      });

      expect(resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ creditsPerUsage: 0, creditsPerMinute: 0 }),
      );
      expect(result.creditsPerUsage).toBe(0);
      expect(result.creditsPerMinute).toBe(0);
    });

    it('throws on fractional values', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);

      await expect(service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await expect(service.updateResourceBillingConfiguration(1, { creditsPerMinute: 2.2 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('allows partial update without validating undefined fields', async () => {
      const cfg = { resourceId: 1, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;

      resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
      resourceBillingConfigurationRepository.save.mockImplementation(
        async (arg) => arg as ResourceBillingConfiguration,
      );

      const result = await service.updateResourceBillingConfiguration(1, { creditsPerUsage: 3 });
      expect(result.creditsPerUsage).toBe(3);
      expect(result.creditsPerMinute).toBe(2);
    });
  });

  describe('configuration currency', () => {
    it('setConfiguration throws on invalid currency', async () => {
      await expect(service.setConfiguration({ currency: 'USD' as Currency })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('setConfiguration updates existing currency setting and returns configuration', async () => {
      settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingRepository.update.mockResolvedValue({} as any);
      // getConfiguration call
      settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await service.setConfiguration({ currency: Currency.EUR });
      expect(settingRepository.update).toHaveBeenCalledWith(1, { value: Currency.EUR });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('setConfiguration inserts currency when not existing and returns configuration', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingRepository.findOneBy.mockResolvedValueOnce(null as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingRepository.insert.mockResolvedValue({} as any);
      // getConfiguration call
      settingRepository.findOneBy.mockResolvedValueOnce({
        id: 2,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await service.setConfiguration({ currency: Currency.EUR });
      expect(settingRepository.insert).toHaveBeenCalledWith({
        parent: 'billing',
        key: 'currency',
        value: Currency.EUR,
      });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration returns defaults when no setting present', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingRepository.findOneBy.mockResolvedValue(null as any);
      const result = await service.getConfiguration();
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration throws on unsupported currency value from DB', async () => {
      settingRepository.findOneBy.mockResolvedValue({ value: 'USD' } as Setting);
      await expect(service.getConfiguration()).rejects.toBeInstanceOf(Error);
    });
  });

  describe('BillingService chargeForResourceUsage', () => {
    it('sends email after completing usage transaction', async () => {
      const usage: Partial<ResourceUsage> = {
        id: 5,
        usageInMinutes: 10,
        resource: { id: 1, name: 'CNC' } as Resource,
        user: { id: 10, billingFactor: 100 } as User,
      };

      // emulate manager path inside transaction()
      const manager = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
          if (entity === BillingTransaction) {
            if (opts?.where?.resourceUsageId === usage.id) return null; // no existing
            if (opts?.where?.id)
              return {
                id: opts.where.id,
                userId: 10,
                amount: -150,
                status: BillingTransactionStatus.Completed,
                items: [],
              };
          }
          if (entity === User) {
            return { id: 10, email: 'u@example.com', creditBalance: 1000 };
          }
          return null;
        }),
        getRepository: jest.fn(() => ({
          findOneBy: jest.fn().mockResolvedValue(null),
          create: jest.fn((data: unknown) => data),
          save: jest.fn(async (data: unknown) => data),
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        save: jest.fn().mockImplementation((entity: any, payload: any) => {
          if (entity === BillingTransaction) {
            return { id: 123, ...payload };
          }
          return payload;
        }),
        update: jest.fn(),
      };

      // override transaction wrapper to call doCalculation directly
      (billingTransactionItemRepository.manager.transaction as unknown as jest.Mock).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(manager),
      );

      jest
        .spyOn(service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

      await service.chargeForResourceUsage(usage as ResourceUsage);

      expect(emailService.sendResourceUsageBillingSummaryEmail).toHaveBeenCalledTimes(1);
      const args = (emailService.sendResourceUsageBillingSummaryEmail as jest.Mock).mock.calls[0];
      expect(args[0]).toMatchObject({ id: 10, email: 'u@example.com' });
      expect(args[2]).toMatchObject({ resource: { name: 'CNC' } });
    });
  });
});
