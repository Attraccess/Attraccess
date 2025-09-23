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
} from '@attraccess/database-entities';
import { LiveNotificationsService } from './liveNotificationsService';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { BadRequestException } from '@nestjs/common';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { Currency } from './dto/set-configuration.dto';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';

describe('BillingService', () => {
  let service: BillingService;
  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let settingRepository: jest.Mocked<Repository<Setting>>;
  let resourceBillingConfigurationRepository: jest.Mocked<Repository<ResourceBillingConfiguration>>;
  let liveNotificationsService: { notifyTransactionUpdate: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: LiveNotificationsService, useValue: { notifyTransactionUpdate: jest.fn() } },
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

  describe('handleResourceUsageEvent', () => {
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
});
