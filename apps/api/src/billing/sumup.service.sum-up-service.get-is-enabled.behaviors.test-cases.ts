import { registerSumUpServiceFixture } from './sumup.service.sum-up-service.test-fixture';
import { SumupTransactionEventType } from './dto/sumup/sumup-transaction-callback.dto';
import { BadRequestException } from '@nestjs/common';
import { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service';
import { BillingTransactionStatus } from '@attraccess/database-entities';

export function registerGetIsEnabledCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerGetMerchantCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
  describe('getMerchant', () => {
    it('returns merchant from SDK', async () => {
      fixture.withApiKey();
      fixture.mockMerchantsGet.mockResolvedValue(fixture.mockMerchant);

      const merchant = await fixture.service.getMerchant();
      expect(fixture.mockMerchantsGet).toHaveBeenCalledWith(fixture.merchantCode);
      expect(merchant).toEqual(fixture.mockMerchant);
    });
  });
}

export function registerGetReadersCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
  describe('getReaders', () => {
    it('lists readers for merchant', async () => {
      fixture.withApiKey();
      fixture.mockReadersList.mockResolvedValue({ items: [{ id: 'r1' }, { id: 'r2' }] });

      const readers = await fixture.service.getReaders();
      expect(fixture.mockReadersList).toHaveBeenCalledWith(fixture.merchantCode);
      expect(readers).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    });
  });
}

export function registerHandleTransactionCallbackCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerPairReaderCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerProcessPendingTransactionsCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}

export function registerRemoveReaderCases(fixture: ReturnType<typeof registerSumUpServiceFixture>) {
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
}
