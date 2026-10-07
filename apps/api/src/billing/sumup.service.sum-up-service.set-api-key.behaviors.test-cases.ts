import { BadRequestException } from '@nestjs/common';
import { registerSumUpServiceFixture } from './sumup.service.sum-up-service.test-fixture';
import { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service';
import { BillingTransaction, BillingTransactionStatus } from '@attraccess/database-entities';

export function registerSetApiKeyCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerTopUpWithReaderCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerUpdateTransactionStatusBySumupServerPrivateCases(
  fixture: ReturnType<typeof registerSumUpServiceFixture>,
) {
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
}
