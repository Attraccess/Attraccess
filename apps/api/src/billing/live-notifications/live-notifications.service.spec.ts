import { BillingLivePersistence } from '../persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { LiveNotificationsService } from './live-notifications.service';
import { BillingTransaction } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';

describe('LiveNotificationsService', () => {
  let service: LiveNotificationsService;
  let persistence: jest.Mocked<BillingLivePersistence>;

  beforeEach(async () => {
    persistence = { transactionWithItems: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiveNotificationsService, { provide: BillingLivePersistence, useValue: persistence }],
    }).compile();

    service = module.get(LiveNotificationsService);
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
      const transaction = { id: 123, userId: 77, items: [] } as unknown as BillingTransaction;
      persistence.transactionWithItems.mockResolvedValue(transaction);

      const received: Array<{ data: BillingTransaction }> = [];
      service.getTransactionSubject(77).subscribe((payload) => received.push(payload));

      await service.notifyTransactionUpdate(123);

      expect(persistence.transactionWithItems).toHaveBeenCalledWith(123);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ data: transaction });
    });

    it('emits when called with a transaction object as input', async () => {
      const tx = { id: 555, userId: 5, items: [] } as unknown as BillingTransaction;
      persistence.transactionWithItems.mockResolvedValue(tx);

      const nextSpy = jest.fn();
      service.getTransactionSubject(5).subscribe(nextSpy);

      await service.notifyTransactionUpdate(tx);

      expect(persistence.transactionWithItems).toHaveBeenCalledWith(555);
      expect(nextSpy).toHaveBeenCalledWith({ data: tx });
    });

    it('throws BadRequestException when transaction not found', async () => {
      persistence.transactionWithItems.mockResolvedValue(null);

      await expect(service.notifyTransactionUpdate(999)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
