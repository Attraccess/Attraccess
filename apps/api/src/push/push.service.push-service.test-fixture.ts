import type { PushSubscriptionRecord } from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import * as webpush from 'web-push';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PushService } from './push.service';
import { PUSH_SUBSCRIPTION_STORE } from './push-subscription-store.port';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

// Real base64url-encoded P-256 key lengths (65 / 32 bytes).
const VALID_PUBLIC_KEY = Buffer.alloc(65, 4).toString('base64url');

const VALID_PRIVATE_KEY = Buffer.alloc(32, 7).toString('base64url');
export function registerPushServiceFixture() {
  let subscriptionStore: {
    count: jest.Mock;
    deleteAll: jest.Mock;
    upsertByEndpoint: jest.Mock;
    findForUser: jest.Mock;
    deleteForUser: jest.Mock;
    deleteById: jest.Mock;
  };

  let settingsStore: {
    getPlainSetting: jest.Mock;
    getSecretSetting: jest.Mock;
    setPlainSetting: jest.Mock;
    setSecretSetting: jest.Mock;
  };

  let settingsService: {
    getPublicInternetUrl: jest.Mock;
    getUrl: jest.Mock;
    getSmtpConfiguration: jest.Mock;
  };

  async function createService(): Promise<PushService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PUSH_SUBSCRIPTION_STORE, useValue: subscriptionStore },
        { provide: SettingsStoreService, useValue: settingsStore },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    return module.get<PushService>(PushService);
  }

  function givenStoredKeys(publicKey: string | null, privateKey: string | null): void {
    settingsStore.getPlainSetting.mockResolvedValue(publicKey);
    settingsStore.getSecretSetting.mockResolvedValue({ value: privateKey, configured: privateKey !== null });
  }

  function makeSubscription(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
    return {
      id: 1,
      userId: 42,
      endpoint: 'https://push.example.com/sub-1',
      p256dh: 'p256dh-key',
      auth: 'auth-secret',
      userAgent: null,
      createdAt: new Date(),
      lastSeenAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionStore = {
      count: jest.fn().mockResolvedValue(0),
      deleteAll: jest.fn().mockResolvedValue(undefined),
      upsertByEndpoint: jest.fn(),
      findForUser: jest.fn(),
      deleteForUser: jest.fn().mockResolvedValue(undefined),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    settingsStore = {
      getPlainSetting: jest.fn(),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn().mockResolvedValue(undefined),
      setSecretSetting: jest.fn().mockResolvedValue(undefined),
    };
    settingsService = {
      getPublicInternetUrl: jest.fn().mockResolvedValue(null),
      getUrl: jest.fn().mockResolvedValue(null),
      getSmtpConfiguration: jest.fn().mockResolvedValue({ from: 'admin@localhost' }),
    };
    mockedWebpush.generateVAPIDKeys.mockReturnValue({
      publicKey: 'generated-public',
      privateKey: 'generated-private',
    });
  });
  return {
    get mockedWebpush() {
      return mockedWebpush;
    },
    get VALID_PUBLIC_KEY() {
      return VALID_PUBLIC_KEY;
    },
    get VALID_PRIVATE_KEY() {
      return VALID_PRIVATE_KEY;
    },
    get subscriptionStore() {
      return subscriptionStore;
    },
    get settingsStore() {
      return settingsStore;
    },
    get settingsService() {
      return settingsService;
    },
    get createService() {
      return createService;
    },
    get givenStoredKeys() {
      return givenStoredKeys;
    },
    get makeSubscription() {
      return makeSubscription;
    },
  };
}
