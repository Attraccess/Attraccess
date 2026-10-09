// Tests for SumUpService billing integration with mocked SDK
// FEATURE: Billing SumUp integration

import { BillingTransaction, Setting } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../audit/audit.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { ExternalCallTimer } from '../../metrics/instrumentation/external/external.helper';
import { SettingsService } from '../../settings/settings.service';
import { BillingService } from '../charges/billing.service';
import { LiveNotificationsService } from '../live-notifications/live-notifications.service';
import { SumUpService } from './sumup.service';

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

const mockSumUpGet = jest.fn();

const mockMerchantsGet = jest.fn();

const mockReadersList = jest.fn();

const mockReadersCreate = jest.fn();

const mockReadersDelete = jest.fn();

const mockReadersCreateCheckout = jest.fn();

const mockTransactionsGet = jest.fn();
export function registerSumUpServiceFixture() {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockAuditService: any = { recordBillingTransaction: jest.fn() };

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
    mockAuditService.recordBillingTransaction.mockReset();
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
        { provide: AuditService, useValue: mockAuditService },
        { provide: CronTimer, useValue: { time: <T>(_n: string, fn: () => Promise<T>) => fn() } },
        {
          provide: ExternalCallTimer,
          useValue: { time: <T>(_t: string, _o: string, fn: () => Promise<T>) => fn() },
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
  return {
    get mockSumUpGet() {
      return mockSumUpGet;
    },
    get mockMerchantsGet() {
      return mockMerchantsGet;
    },
    get mockReadersList() {
      return mockReadersList;
    },
    get mockReadersCreate() {
      return mockReadersCreate;
    },
    get mockReadersDelete() {
      return mockReadersDelete;
    },
    get mockReadersCreateCheckout() {
      return mockReadersCreateCheckout;
    },
    get mockTransactionsGet() {
      return mockTransactionsGet;
    },
    get mockAuditService() {
      return mockAuditService;
    },
    get service() {
      return service;
    },
    get settingRepository() {
      return settingRepository;
    },
    get billingTransactionRepository() {
      return billingTransactionRepository;
    },
    get encryptionService() {
      return encryptionService;
    },
    get liveNotificationsService() {
      return liveNotificationsService;
    },
    get billingService() {
      return billingService;
    },
    get merchantCode() {
      return merchantCode;
    },
    get withApiKey() {
      return withApiKey;
    },
    get mockMerchant() {
      return mockMerchant;
    },
  };
}
