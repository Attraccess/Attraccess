import { BillingTransactionRecord } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';
import { FakeBillingLedgerStore } from '../testing/billing-store.fakes';
import { LiveNotificationsService } from './live-notifications.service';

describe('LiveNotificationsService', () => {
  let service: LiveNotificationsService;
  let ledgerStore: FakeBillingLedgerStore;

  const stored = (id: number, userId: number): BillingTransactionRecord => {
    const record = { id, userId, amount: 0, items: [] } as unknown as BillingTransactionRecord;
    ledgerStore.transactions.push(record);
    return record;
  };

  beforeEach(() => {
    ledgerStore = new FakeBillingLedgerStore();
    service = new LiveNotificationsService(ledgerStore);
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

  describe('deleteSubjectIfUnobserved', () => {
    it('drops a subject nobody listens to and keeps an observed one', () => {
      const observed = service.getTransactionSubject(1);
      const subscription = observed.subscribe();
      service.getTransactionSubject(2);

      service.deleteSubjectIfUnobserved(1);
      service.deleteSubjectIfUnobserved(2);

      expect(service.getTransactionSubject(1)).toBe(observed);
      subscription.unsubscribe();
      expect(service.getTransactionSubject(2)).not.toBeUndefined();
    });
  });

  describe('notifyTransactionUpdate', () => {
    it('emits the stored transaction on the owner’s subject when found by id', async () => {
      const transaction = stored(123, 77);
      const received: Array<{ data: BillingTransactionRecord }> = [];
      service.getTransactionSubject(77).subscribe((payload) => received.push(payload));
      const other = jest.fn();
      service.getTransactionSubject(78).subscribe(other);

      await service.notifyTransactionUpdate(123);

      expect(received).toEqual([{ data: transaction }]);
      expect(other).not.toHaveBeenCalled();
    });

    it('emits the stored version when called with a transaction object', async () => {
      const transaction = stored(555, 5);
      const nextSpy = jest.fn();
      service.getTransactionSubject(5).subscribe(nextSpy);

      await service.notifyTransactionUpdate({ id: 555 });

      expect(nextSpy).toHaveBeenCalledWith({ data: transaction });
    });

    it('throws BadRequestException when the transaction is not found', async () => {
      await expect(service.notifyTransactionUpdate(999)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
