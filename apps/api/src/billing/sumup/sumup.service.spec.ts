import { registerSumUpServiceFixture } from './service.test-fixture';
import { SumupTransactionEventType } from '../dto/sumup/sumup-transaction-callback.dto';
import { BadRequestException } from '@nestjs/common';
import { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service';
import { BillingTransactionStatus, BillingTransaction } from '@attraccess/database-entities';

describe('SumUpService', () => {
  const fixture = registerSumUpServiceFixture();

  describe('setApiKey', () => {
    it('stores encrypted API key and merchant code via update when existing', async () => {
      fixture.mockSumUpGet.mockResolvedValue({ merchant_profile: { merchant_code: 'M123' } });
      fixture.settingRepository.findOneBy.mockResolvedValue({ id: 1, value: 'enc' });
      fixture.encryptionService.encrypt.mockReturnValue('encrypted');

      await fixture.service.setApiKey('token');

      expect(fixture.settingRepository.update).toHaveBeenCalledWith(1, { value: 'encrypted' });
      expect(fixture.settingRepository.update).toHaveBeenCalledWith(1, { value: 'M123' });
      expect(fixture.settingRepository.insert).not.toHaveBeenCalled();
    });

    it('stores encrypted API key and merchant code via insert when missing', async () => {
      fixture.mockSumUpGet.mockResolvedValue({ merchant_profile: { merchant_code: 'M123' } });
      fixture.settingRepository.findOneBy.mockResolvedValue(null);
      fixture.encryptionService.encrypt.mockReturnValue('encrypted');

      await fixture.service.setApiKey('token');

      expect(fixture.settingRepository.insert).toHaveBeenCalledWith({
        parent: 'sumup',
        key: 'apiKey',
        value: 'encrypted',
      });
      expect(fixture.settingRepository.insert).toHaveBeenCalledWith({
        parent: 'sumup',
        key: 'merchantCode',
        value: 'M123',
      });
      expect(fixture.settingRepository.update).not.toHaveBeenCalled();
    });

    it.each([
      ['merchant_profile is absent', { account: { username: 'x' }, personal_profile: { first_name: 'A' } }],
      [
        'merchant_profile carries no merchant_code',
        { account: { username: 'x' }, merchant_profile: { company_name: 'Attraccess' } },
      ],
    ])('throws and stores nothing when %s', async (_case, meResponse) => {
      fixture.mockSumUpGet.mockResolvedValue(meResponse);
      fixture.settingRepository.findOneBy.mockResolvedValue(null);

      await expect(fixture.service.setApiKey('token')).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.settingRepository.insert).not.toHaveBeenCalled();
      expect(fixture.settingRepository.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on invalid API key', async () => {
      fixture.mockSumUpGet.mockRejectedValue(new Error('invalid'));

      await expect(fixture.service.setApiKey('bad')).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.settingRepository.insert).not.toHaveBeenCalled();
      expect(fixture.settingRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getIsEnabled', () => {
    it('returns false when key missing', async () => {
      fixture.settingRepository.findOneBy.mockResolvedValue(null);

      await expect(fixture.service.getIsEnabled()).resolves.toBe(false);
    });

    it('returns false when decryption fails', async () => {
      fixture.settingRepository.findOneBy.mockResolvedValue({ value: 'enc' });
      fixture.encryptionService.decrypt.mockImplementation(() => {
        throw new Error('bad');
      });

      await expect(fixture.service.getIsEnabled()).resolves.toBe(false);
    });

    it('returns true when decryption succeeds', async () => {
      fixture.settingRepository.findOneBy.mockResolvedValue({ value: 'enc' });
      fixture.encryptionService.decrypt.mockReturnValue('token');

      await expect(fixture.service.getIsEnabled()).resolves.toBe(true);
    });
  });

  describe('getMerchant', () => {
    it('returns merchant from SDK', async () => {
      fixture.withApiKey();
      fixture.mockMerchantsGet.mockResolvedValue(fixture.mockMerchant);

      const merchant = await fixture.service.getMerchant();
      expect(fixture.mockMerchantsGet).toHaveBeenCalledWith(fixture.merchantCode);
      expect(merchant).toEqual(fixture.mockMerchant);
    });
  });

  describe('getReaders', () => {
    it('lists readers for merchant', async () => {
      fixture.withApiKey();
      fixture.mockReadersList.mockResolvedValue({ items: [{ id: 'r1' }, { id: 'r2' }] });

      const readers = await fixture.service.getReaders();
      expect(fixture.mockReadersList).toHaveBeenCalledWith(fixture.merchantCode);
      expect(readers).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    });
  });

  describe('pairReader', () => {
    it('creates reader with uppercase pairing code', async () => {
      fixture.withApiKey();
      fixture.mockReadersCreate.mockResolvedValue({ id: 'rid' });

      const res = await fixture.service.pairReader('ab12', 'My Reader');
      expect(fixture.mockReadersCreate).toHaveBeenCalledWith(fixture.merchantCode, {
        pairing_code: 'AB12',
        name: 'My Reader',
      });
      expect(res).toEqual({ id: 'rid' });
    });

    it('wraps SDK error into BadRequestException with message preference', async () => {
      fixture.withApiKey();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err: any = new Error('fallback');
      err.error = { message: 'Specific' };
      fixture.mockReadersCreate.mockRejectedValue(err);

      await expect(fixture.service.pairReader('code', 'name')).rejects.toEqual(new BadRequestException('Specific'));
    });
  });

  describe('removeReader', () => {
    it('swallows unexpected non-json response error', async () => {
      fixture.withApiKey();
      fixture.mockReadersDelete.mockRejectedValue(new Error('SumUpError: Unexpected non-json response'));

      await expect(fixture.service.removeReader('rid')).resolves.toBeUndefined();
    });

    it('rethrows other errors', async () => {
      fixture.withApiKey();
      fixture.mockReadersDelete.mockRejectedValue(new Error('Some other error'));

      await expect(fixture.service.removeReader('rid')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('topUpWithReader', () => {
    it('rejects non-integer amount', async () => {
      await expect(fixture.service.topUpWithReader(1, 'rid', 12.34)).rejects.toEqual(
        new BadRequestException('Amount must be an integer (multiply by currency minor unit)'),
      );
    });

    it('creates checkout, saves transaction, and notifies', async () => {
      fixture.withApiKey();
      fixture.billingService.getConfiguration.mockResolvedValue({ currency: 'EUR', minorUnit: 2 });
      fixture.mockReadersCreateCheckout.mockResolvedValue({ data: { client_transaction_id: 'tx123' } });
      fixture.billingTransactionRepository.save.mockImplementation(async (t: BillingTransaction) => ({ id: 1, ...t }));

      const tx = await fixture.service.topUpWithReader(42, 'reader-1', 500);

      expect(fixture.mockReadersCreateCheckout).toHaveBeenCalledWith(
        fixture.merchantCode,
        'reader-1',
        expect.objectContaining({
          description: 'Attraccess Top-up',
          total_amount: { currency: 'EUR', value: 500, minor_unit: 2 },
          return_url: 'https://example.com/api/billing/top-up/sumup/callback',
        }),
      );
      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith({
        userId: 42,
        amount: 500,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx123`,
        status: BillingTransactionStatus.Pending,
      });
      expect(fixture.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
      expect(fixture.mockAuditService.recordBillingTransaction).toHaveBeenCalledWith({
        transactionId: 1,
        userId: 42,
        amount: 500,
        status: BillingTransactionStatus.Pending,
        source: 'sumup-topup',
      });
      expect(tx).toEqual(expect.objectContaining({ id: 1, userId: 42 }));
    });

    it('maps reader not found error', async () => {
      fixture.withApiKey();
      fixture.billingService.getConfiguration.mockResolvedValue({ currency: 'EUR', minorUnit: 2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err: any = new Error('not found');
      err.status = 404;
      err.error = { errors: { detail: 'Not Found' } };
      fixture.mockReadersCreateCheckout.mockRejectedValue(err);

      await expect(fixture.service.topUpWithReader(1, 'rid', 100)).rejects.toEqual(
        new BadRequestException('READER_NOT_FOUND'),
      );
    });
  });

  describe('handleTransactionCallback', () => {
    it('ignores unrelated events', async () => {
      await expect(
        fixture.service.handleTransactionCallback({
          event_type: 'OTHER' as SumupTransactionEventType,
          payload: { client_transaction_id: 'tx' },
        }),
      ).resolves.toBeUndefined();
    });

    it('calls update by server on valid event', async () => {
      const spy = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn<any, any>(fixture.service as any, 'updateTransactionStatusBySumupServer')
        .mockResolvedValue(undefined);
      await fixture.service.handleTransactionCallback({
        event_type: 'solo.transaction.updated' as SumupTransactionEventType,
        payload: { client_transaction_id: 'abc' },
      });
      expect(spy).toHaveBeenCalledWith('abc');
    });
  });

  describe('updateTransactionStatusBySumupServer (private)', () => {
    const callPrivate = async (id: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fixture.service as any).updateTransactionStatusBySumupServer(id) as Promise<void>;

    beforeEach(() => {
      fixture.withApiKey();
    });

    it('throws when transaction not found', async () => {
      fixture.billingTransactionRepository.findOneBy.mockResolvedValue(null);
      await expect(callPrivate('tx1')).rejects.toEqual(new BadRequestException('Sumup transaction not found'));
    });

    it('maps SUCCESSFUL to Completed and notifies', async () => {
      const transaction = {
        id: 10,
        userId: 42,
        amount: 500,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx1`,
        status: BillingTransactionStatus.Pending,
      };
      fixture.billingTransactionRepository.findOneBy.mockResolvedValue(transaction);
      fixture.mockTransactionsGet.mockResolvedValue({ status: 'SUCCESSFUL' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.billingTransactionRepository.save.mockImplementation(async (t: any) => t);

      await callPrivate('tx1');

      expect(transaction.status).toBe(BillingTransactionStatus.Completed);
      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith(transaction);
      expect(fixture.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(transaction);
      expect(fixture.mockAuditService.recordBillingTransaction).toHaveBeenCalledWith({
        transactionId: 10,
        userId: 42,
        amount: 500,
        status: BillingTransactionStatus.Completed,
        previousStatus: BillingTransactionStatus.Pending,
        source: 'sumup-topup',
      });
    });

    it('maps FAILED to Failed', async () => {
      const transaction = {
        id: 11,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx2`,
        status: BillingTransactionStatus.Pending,
      };
      fixture.billingTransactionRepository.findOneBy.mockResolvedValue(transaction);
      fixture.mockTransactionsGet.mockResolvedValue({ status: 'FAILED' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.billingTransactionRepository.save.mockImplementation(async (t: any) => t);

      await callPrivate('tx2');
      expect(transaction.status).toBe(BillingTransactionStatus.Failed);
    });
  });

  describe('processPendingTransactions', () => {
    it('skips non-sumup refs, handles invalid ids, and updates valid ones', async () => {
      const badRefTx = {
        id: 1,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}`,
        status: BillingTransactionStatus.Pending,
      };
      const okTx = {
        id: 2,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:abc`,
        status: BillingTransactionStatus.Pending,
      };
      const otherTx = { id: 3, externalReference: `other:xyz`, status: BillingTransactionStatus.Pending };
      fixture.billingTransactionRepository.findBy.mockResolvedValue([badRefTx, okTx, otherTx]);
      const spyUpdate = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn<any, any>(fixture.service as any, 'updateTransactionStatusBySumupServer')
        .mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.billingTransactionRepository.save.mockImplementation(async (t: any) => t);

      await fixture.service.processPendingTransactions();

      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, status: BillingTransactionStatus.Failed }),
      );
      expect(spyUpdate).toHaveBeenCalledWith('abc');
      expect(spyUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
