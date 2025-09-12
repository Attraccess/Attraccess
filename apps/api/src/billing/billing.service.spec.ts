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
} from '@attraccess/database-entities';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { ResourceUsageEvent } from '../resources/usage/events/resource-usage.events';

describe('BillingService', () => {
  let service: BillingService;
  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;
  let userRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
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
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BillingService);
    billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction)) as jest.Mocked<
      Repository<BillingTransaction>
    >;
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
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
          relations: expect.arrayContaining(['initiator', 'resourceUsage', 'refundOf']),
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

      expect(billingTransactionRepository.save).toHaveBeenCalledWith({ userId: 1, initiatorId: 2, amount: 100 });
      expect(result).toEqual({ id: 123 });
    });

    it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

      await expect(service.createManualTransaction(1, 2, -20, true)).rejects.toBeInstanceOf(InsufficientBalanceError);
    });

    it('allows negative charge when balance stays non-negative', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      billingTransactionRepository.save.mockResolvedValue({ id: 456 } as BillingTransaction);

      const result = await service.createManualTransaction(1, 2, -20, true);

      expect(billingTransactionRepository.save).toHaveBeenCalledWith({ userId: 1, initiatorId: 2, amount: -20 });
      expect(result).toEqual({ id: 456 });
    });
  });

  describe('handleResourceUsageEvent', () => {
    it('does nothing for non-Usage actions', async () => {
      const usage = {
        id: 10,
        usageAction: ResourceUsageAction.DoorLock,
        endTime: new Date(),
        usageInMinutes: 3,
        resource: { id: 99 },
        userId: 7,
      } as unknown as ResourceUsage;

      const getConfigSpy = jest.spyOn(service, 'getResourceBillingConfiguration');

      await service.handleResourceUsageEvent(new ResourceUsageEvent(usage));

      expect(getConfigSpy).not.toHaveBeenCalled();
      expect(billingTransactionRepository.save).not.toHaveBeenCalled();
    });

    it('does nothing when session is not ended (endTime is null)', async () => {
      const usage = {
        id: 11,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        usageInMinutes: -1,
        resource: { id: 100 },
        userId: 8,
      } as unknown as ResourceUsage;

      const getConfigSpy = jest.spyOn(service, 'getResourceBillingConfiguration');

      await service.handleResourceUsageEvent(new ResourceUsageEvent(usage));

      expect(getConfigSpy).not.toHaveBeenCalled();
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

      await service.handleResourceUsageEvent(new ResourceUsageEvent(usage));

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(101);
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

      await service.handleResourceUsageEvent(new ResourceUsageEvent(usage));

      expect(service.getResourceBillingConfiguration).toHaveBeenCalledWith(102);
      expect(billingTransactionRepository.save).toHaveBeenCalledWith({
        userId: 10,
        resourceUsageId: 13,
        amount: -35,
      });
    });
  });
});
