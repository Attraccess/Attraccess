import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
// Tests for SumUpService billing integration with mocked SDK
// FEATURE: Billing SumUp integration

import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '../../encryption/encryption.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { ExternalCallTimer } from '../../metrics/instrumentation/external/external.helper';
import { SettingsService } from '../../settings/settings.service';
import { BillingService } from '../charges/billing.service';
import { LiveNotificationsService } from '../live-notifications/live-notifications.service';
import { BILLING_LEDGER_STORE } from '../ports/billing-ledger.port';
import { SUMUP_CREDENTIAL_STORE } from '../ports/sumup-credentials.port';
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
  const mockCredentialStore: any = {
    getEncryptedApiKey: jest.fn(),
    getMerchantCode: jest.fn(),
    saveCredentials: jest.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockLedgerStore: any = {
    insertTransaction: jest.fn(),
    findTransactionByExternalReference: jest.fn(),
    listPendingTransactions: jest.fn(),
    updateTransactionStatus: jest.fn(),
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
  const mockAuditService: any = { record: jest.fn() };

  let service: SumUpService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let credentialStore: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ledgerStore: any;

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
    Object.values(mockCredentialStore).forEach((mock) => (mock as jest.Mock).mockReset());
    Object.values(mockLedgerStore).forEach((mock) => (mock as jest.Mock).mockReset());
    mockEncryptionService.encrypt.mockReset();
    mockEncryptionService.decrypt.mockReset();
    mockLiveNotificationsService.notifyTransactionUpdate.mockReset();
    mockBillingService.getConfiguration.mockReset();
    mockSettingsService.getPublicInternetUrl.mockReset();
    mockAuditService.record.mockReset();
  };

  beforeEach(async () => {
    resetAllMocks();

    mockSettingsService.getPublicInternetUrl.mockResolvedValue('https://example.com');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SumUpService,
        { provide: SUMUP_CREDENTIAL_STORE, useValue: mockCredentialStore },
        { provide: BILLING_LEDGER_STORE, useValue: mockLedgerStore },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: LiveNotificationsService, useValue: mockLiveNotificationsService },
        { provide: BillingService, useValue: mockBillingService },
        { provide: AUDIT_RECORDER, useValue: mockAuditService },
        { provide: CronTimer, useValue: { time: <T>(_n: string, fn: () => Promise<T>) => fn() } },
        {
          provide: ExternalCallTimer,
          useValue: { time: <T>(_t: string, _o: string, fn: () => Promise<T>) => fn() },
        },
      ],
    }).compile();

    service = module.get(SumUpService);
    credentialStore = module.get(SUMUP_CREDENTIAL_STORE);
    ledgerStore = module.get(BILLING_LEDGER_STORE);
    encryptionService = module.get(EncryptionService);
    liveNotificationsService = module.get(LiveNotificationsService);
    billingService = module.get(BillingService);
  });

  const merchantCode = 'M123';

  const withApiKey = () => {
    credentialStore.getEncryptedApiKey.mockResolvedValue('enc');
    credentialStore.getMerchantCode.mockResolvedValue(merchantCode);
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
    get credentialStore() {
      return credentialStore;
    },
    get ledgerStore() {
      return ledgerStore;
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
