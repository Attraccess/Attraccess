// Tests for SumUpService billing integration with mocked SDK
// FEATURE: Billing SumUp integration

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SumUpService, SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service';
import { BillingTransaction, Setting, BillingTransactionStatus } from '@attraccess/database-entities';
import { EncryptionService } from '../encryption/encryption.service';
import { BillingService } from './billing.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { SumupTransactionEventType } from './dto/sumup/sumup-transaction-callback.dto';
import { SettingsService } from '../settings/settings.service';
import { CronTimer } from '../metrics/instrumentation/cron/cron.helper';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';

const mockSumUpGet = jest.fn();
const mockMerchantsGet = jest.fn();
const mockReadersList = jest.fn();
const mockReadersCreate = jest.fn();
const mockReadersDelete = jest.fn();
const mockReadersCreateCheckout = jest.fn();
const mockTransactionsGet = jest.fn();

jest.mock('@sumup/sdk', () => {
  return {
    SumUp: jest.fn().mockImplementation(() => ({
      get: mockSumUpGet,
      merchants: { get: mockMerchantsGet },
      readers: {
        list: mockReadersList,
        create: mockReadersCreate,
        delete: mockReadersDelete,
        createCheckout: mockReadersCreateCheckout,
      },
      transactions: { get: mockTransactionsGet },
    })),
  };
});

describe('SumUpService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockSettingRepository: any = {
    findOneBy: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockBillingTransactionRepository: any = {
    save: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEncryptionService: any = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockLiveNotificationsService: any = {
    notifyTransactionUpdate: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockBillingService: any = {
    getConfiguration: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockSettingsService: any = {
    getPublicInternetUrl: jest.fn(),
  };

  let service: SumUpService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let settingRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingTransactionRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let encryptionService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveNotificationsService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingService: any;

  const resetAllMocks = () => {
    jest.clearAllMocks();
    mockSumUpGet.mockReset();
    mockMerchantsGet.mockReset();
    mockReadersList.mockReset();
    mockReadersCreate.mockReset();
    mockReadersDelete.mockReset();
    mockReadersCreateCheckout.mockReset();
    mockTransactionsGet.mockReset();
    mockSettingRepository.findOneBy.mockReset();
    mockSettingRepository.update.mockReset();
    mockSettingRepository.insert.mockReset();
    mockBillingTransactionRepository.save.mockReset();
    mockBillingTransactionRepository.findOneBy.mockReset();
    mockBillingTransactionRepository.findBy.mockReset();
    mockEncryptionService.encrypt.mockReset();
    mockEncryptionService.decrypt.mockReset();
    mockLiveNotificationsService.notifyTransactionUpdate.mockReset();
    mockBillingService.getConfiguration.mockReset();
    mockSettingsService.getPublicInternetUrl.mockReset();
  };

  beforeEach(async () => {
    resetAllMocks();

    mockSettingsService.getPublicInternetUrl.mockResolvedValue('https://example.com');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SumUpService,
        { provide: getRepositoryToken(Setting), useValue: mockSettingRepository },
        { provide: getRepositoryToken(BillingTransaction), useValue: mockBillingTransactionRepository },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: LiveNotificationsService, useValue: mockLiveNotificationsService },
        { provide: BillingService, useValue: mockBillingService },
        { provide: CronTimer, useValue: { time: <T,>(_n: string, fn: () => Promise<T>) => fn() } },
        {
          provide: ExternalCallTimer,
          useValue: { time: <T,>(_t: string, _o: string, fn: () => Promise<T>) => fn() },
        },
      ],
    }).compile();

    service = module.get(SumUpService);
    settingRepository = module.get(getRepositoryToken(Setting));
    billingTransactionRepository = module.get(getRepositoryToken(BillingTransaction));
    encryptionService = module.get(EncryptionService);
    liveNotificationsService = module.get(LiveNotificationsService);
    billingService = module.get(BillingService);
  });

  describe('setApiKey', () => {
    it('stores encrypted API key and merchant code via update when existing', async () => {
      mockSumUpGet.mockResolvedValue({ merchant_profile: { merchant_code: 'M123' } });
      settingRepository.findOneBy.mockResolvedValue({ id: 1, value: 'enc' });
      encryptionService.encrypt.mockReturnValue('encrypted');

      await service.setApiKey('token');

      expect(settingRepository.update).toHaveBeenCalledWith(1, { value: 'encrypted' });
      expect(settingRepository.update).toHaveBeenCalledWith(1, { value: 'M123' });
      expect(settingRepository.insert).not.toHaveBeenCalled();
    });

    it('stores encrypted API key and merchant code via insert when missing', async () => {
      mockSumUpGet.mockResolvedValue({ merchant_profile: { merchant_code: 'M123' } });
      settingRepository.findOneBy.mockResolvedValue(null);
      encryptionService.encrypt.mockReturnValue('encrypted');

      await service.setApiKey('token');

      expect(settingRepository.insert).toHaveBeenCalledWith({ parent: 'sumup', key: 'apiKey', value: 'encrypted' });
      expect(settingRepository.insert).toHaveBeenCalledWith({ parent: 'sumup', key: 'merchantCode', value: 'M123' });
      expect(settingRepository.update).not.toHaveBeenCalled();
    });

    it.each([
      ['merchant_profile is absent', { account: { username: 'x' }, personal_profile: { first_name: 'A' } }],
      [
        'merchant_profile carries no merchant_code',
        { account: { username: 'x' }, merchant_profile: { company_name: 'Attraccess' } },
      ],
    ])('throws and stores nothing when %s', async (_case, meResponse) => {
      mockSumUpGet.mockResolvedValue(meResponse);
      settingRepository.findOneBy.mockResolvedValue(null);

      await expect(service.setApiKey('token')).rejects.toBeInstanceOf(BadRequestException);
      expect(settingRepository.insert).not.toHaveBeenCalled();
      expect(settingRepository.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on invalid API key', async () => {
      mockSumUpGet.mockRejectedValue(new Error('invalid'));

      await expect(service.setApiKey('bad')).rejects.toBeInstanceOf(BadRequestException);
      expect(settingRepository.insert).not.toHaveBeenCalled();
      expect(settingRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getIsEnabled', () => {
    it('returns false when key missing', async () => {
      settingRepository.findOneBy.mockResolvedValue(null);

      await expect(service.getIsEnabled()).resolves.toBe(false);
    });

    it('returns false when decryption fails', async () => {
      settingRepository.findOneBy.mockResolvedValue({ value: 'enc' });
      encryptionService.decrypt.mockImplementation(() => {
        throw new Error('bad');
      });

      await expect(service.getIsEnabled()).resolves.toBe(false);
    });

    it('returns true when decryption succeeds', async () => {
      settingRepository.findOneBy.mockResolvedValue({ value: 'enc' });
      encryptionService.decrypt.mockReturnValue('token');

      await expect(service.getIsEnabled()).resolves.toBe(true);
    });
  });

  const merchantCode = 'M123';

  const withApiKey = () => {
    settingRepository.findOneBy.mockImplementation(({ key }: { key: string }) => {
      if (key === 'apiKey') return Promise.resolve({ value: 'enc' });
      if (key === 'merchantCode') return Promise.resolve({ value: merchantCode });
      return Promise.resolve(null);
    });
    encryptionService.decrypt.mockReturnValue('token');
  };

  const mockMerchant = { merchant_code: merchantCode, default_currency: 'EUR', default_locale: 'en-US' };

  describe('getMerchant', () => {
    it('returns merchant from SDK', async () => {
      withApiKey();
      mockMerchantsGet.mockResolvedValue(mockMerchant);

      const merchant = await service.getMerchant();
      expect(mockMerchantsGet).toHaveBeenCalledWith(merchantCode);
      expect(merchant).toEqual(mockMerchant);
    });
  });

  describe('getReaders', () => {
    it('lists readers for merchant', async () => {
      withApiKey();
      mockReadersList.mockResolvedValue({ items: [{ id: 'r1' }, { id: 'r2' }] });

      const readers = await service.getReaders();
      expect(mockReadersList).toHaveBeenCalledWith(merchantCode);
      expect(readers).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    });
  });

  describe('pairReader', () => {
    it('creates reader with uppercase pairing code', async () => {
      withApiKey();
      mockReadersCreate.mockResolvedValue({ id: 'rid' });

      const res = await service.pairReader('ab12', 'My Reader');
      expect(mockReadersCreate).toHaveBeenCalledWith(merchantCode, { pairing_code: 'AB12', name: 'My Reader' });
      expect(res).toEqual({ id: 'rid' });
    });

    it('wraps SDK error into BadRequestException with message preference', async () => {
      withApiKey();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err: any = new Error('fallback');
      err.error = { message: 'Specific' };
      mockReadersCreate.mockRejectedValue(err);

      await expect(service.pairReader('code', 'name')).rejects.toEqual(new BadRequestException('Specific'));
    });
  });

  describe('removeReader', () => {
    it('swallows unexpected non-json response error', async () => {
      withApiKey();
      mockReadersDelete.mockRejectedValue(new Error('SumUpError: Unexpected non-json response'));

      await expect(service.removeReader('rid')).resolves.toBeUndefined();
    });

    it('rethrows other errors', async () => {
      withApiKey();
      mockReadersDelete.mockRejectedValue(new Error('Some other error'));

      await expect(service.removeReader('rid')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('topUpWithReader', () => {
    it('rejects non-integer amount', async () => {
      await expect(service.topUpWithReader(1, 'rid', 12.34)).rejects.toEqual(
        new BadRequestException('Amount must be an integer (multiply by currency minor unit)'),
      );
    });

    it('creates checkout, saves transaction, and notifies', async () => {
      withApiKey();
      billingService.getConfiguration.mockResolvedValue({ currency: 'EUR', minorUnit: 2 });
      mockReadersCreateCheckout.mockResolvedValue({ data: { client_transaction_id: 'tx123' } });
      billingTransactionRepository.save.mockImplementation(async (t: BillingTransaction) => ({ id: 1, ...t }));

      const tx = await service.topUpWithReader(42, 'reader-1', 500);

      expect(mockReadersCreateCheckout).toHaveBeenCalledWith(
        merchantCode,
        'reader-1',
        expect.objectContaining({
          description: 'Attraccess Top-up',
          total_amount: { currency: 'EUR', value: 500, minor_unit: 2 },
          return_url: 'https://example.com/api/billing/top-up/sumup/callback',
        }),
      );
      expect(billingTransactionRepository.save).toHaveBeenCalledWith({
        userId: 42,
        amount: 500,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx123`,
        status: BillingTransactionStatus.Pending,
      });
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
      expect(tx).toEqual(expect.objectContaining({ id: 1, userId: 42 }));
    });

    it('maps reader not found error', async () => {
      withApiKey();
      billingService.getConfiguration.mockResolvedValue({ currency: 'EUR', minorUnit: 2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err: any = new Error('not found');
      err.status = 404;
      err.error = { errors: { detail: 'Not Found' } };
      mockReadersCreateCheckout.mockRejectedValue(err);

      await expect(service.topUpWithReader(1, 'rid', 100)).rejects.toEqual(new BadRequestException('READER_NOT_FOUND'));
    });
  });

  describe('handleTransactionCallback', () => {
    it('ignores unrelated events', async () => {
      await expect(
        service.handleTransactionCallback({
          event_type: 'OTHER' as SumupTransactionEventType,
          payload: { client_transaction_id: 'tx' },
        }),
      ).resolves.toBeUndefined();
    });

    it('calls update by server on valid event', async () => {
      const spy = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn<any, any>(service as any, 'updateTransactionStatusBySumupServer')
        .mockResolvedValue(undefined);
      await service.handleTransactionCallback({
        event_type: 'solo.transaction.updated' as SumupTransactionEventType,
        payload: { client_transaction_id: 'abc' },
      });
      expect(spy).toHaveBeenCalledWith('abc');
    });
  });

  describe('updateTransactionStatusBySumupServer (private)', () => {
    const callPrivate = async (id: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).updateTransactionStatusBySumupServer(id) as Promise<void>;

    beforeEach(() => {
      withApiKey();
    });

    it('throws when transaction not found', async () => {
      billingTransactionRepository.findOneBy.mockResolvedValue(null);
      await expect(callPrivate('tx1')).rejects.toEqual(new BadRequestException('Sumup transaction not found'));
    });

    it('maps SUCCESSFUL to Completed and notifies', async () => {
      const transaction = {
        id: 10,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx1`,
        status: BillingTransactionStatus.Pending,
      };
      billingTransactionRepository.findOneBy.mockResolvedValue(transaction);
      mockTransactionsGet.mockResolvedValue({ status: 'SUCCESSFUL' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      billingTransactionRepository.save.mockImplementation(async (t: any) => t);

      await callPrivate('tx1');

      expect(transaction.status).toBe(BillingTransactionStatus.Completed);
      expect(billingTransactionRepository.save).toHaveBeenCalledWith(transaction);
      expect(liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(transaction);
    });

    it('maps FAILED to Failed', async () => {
      const transaction = {
        id: 11,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:tx2`,
        status: BillingTransactionStatus.Pending,
      };
      billingTransactionRepository.findOneBy.mockResolvedValue(transaction);
      mockTransactionsGet.mockResolvedValue({ status: 'FAILED' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      billingTransactionRepository.save.mockImplementation(async (t: any) => t);

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
      billingTransactionRepository.findBy.mockResolvedValue([badRefTx, okTx, otherTx]);
      const spyUpdate = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn<any, any>(service as any, 'updateTransactionStatusBySumupServer')
        .mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      billingTransactionRepository.save.mockImplementation(async (t: any) => t);

      await service.processPendingTransactions();

      expect(billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, status: BillingTransactionStatus.Failed }),
      );
      expect(spyUpdate).toHaveBeenCalledWith('abc');
      expect(spyUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
