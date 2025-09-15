import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiveNotificationsService } from './liveNotificationsService';
import { BillingTransaction } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';

describe('LiveNotificationsService', () => {
  let service: LiveNotificationsService;
  let billingTransactionRepository: jest.Mocked<Repository<BillingTransaction>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveNotificationsService,
        {
          provide: getRepositoryToken(BillingTransaction),
          useValue: {
            findOneBy: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(LiveNotificationsService);
    billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction)) as jest.Mocked<
      Repository<BillingTransaction>
    >;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTransactionSubject', () => {
    it('creates and memoizes a subject per user', () => {
      const s1 = service.getTransactionSubject(1);
      const s2 = service.getTransactionSubject(1);
      const s3 = service.getTransactionSubject(2);
      expect(s1).toBe(s2);
      expect(s1).not.toBe(s3);
    });
  });

  describe('notifyTransactionUpdate', () => {
    it('emits the transaction on the user subject when found by id', async () => {
      const transaction = { id: 123, userId: 77 } as unknown as BillingTransaction;
      billingTransactionRepository.findOneBy.mockResolvedValue(transaction);

      const received: Array<{ data: BillingTransaction }> = [];
      service.getTransactionSubject(77).subscribe((payload) => received.push(payload));

      await service.notifyTransactionUpdate(123);

      expect(billingTransactionRepository.findOneBy).toHaveBeenCalledWith({ id: 123 });
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ data: transaction });
    });

    it('emits when called with a transaction object as input', async () => {
      const tx = { id: 555, userId: 5 } as unknown as BillingTransaction;
      billingTransactionRepository.findOneBy.mockResolvedValue(tx);

      const nextSpy = jest.fn();
      service.getTransactionSubject(5).subscribe(nextSpy);

      await service.notifyTransactionUpdate(tx);

      expect(billingTransactionRepository.findOneBy).toHaveBeenCalledWith({ id: 555 });
      expect(nextSpy).toHaveBeenCalledWith({ data: tx });
    });

    it('throws BadRequestException when transaction not found', async () => {
      billingTransactionRepository.findOneBy.mockResolvedValue(null);

      await expect(service.notifyTransactionUpdate(999)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
