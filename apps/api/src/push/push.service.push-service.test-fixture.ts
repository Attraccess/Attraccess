import { PushSubscription } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as webpush from 'web-push';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

// Real base64url-encoded P-256 key lengths (65 / 32 bytes).
const VALID_PUBLIC_KEY = Buffer.alloc(65, 4).toString('base64url');

const VALID_PRIVATE_KEY = Buffer.alloc(32, 7).toString('base64url');
export function registerPushServiceFixture() {
  let subscriptionRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
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

  let deleteExecute: jest.Mock;

  async function createService(): Promise<PushService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getRepositoryToken(PushSubscription), useValue: subscriptionRepository },
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

  function makeSubscription(overrides: Partial<PushSubscription> = {}): PushSubscription {
    return {
      id: 1,
      userId: 42,
      endpoint: 'https://push.example.com/sub-1',
      p256dh: 'p256dh-key',
      auth: 'auth-secret',
      userAgent: null,
      createdAt: new Date(),
      lastSeenAt: null,
      user: undefined,
      ...overrides,
    } as PushSubscription;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    deleteExecute = jest.fn().mockResolvedValue({ affected: 0 });
    subscriptionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => ({
        delete: () => ({ execute: deleteExecute }),
      })),
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
    get subscriptionRepository() {
      return subscriptionRepository;
    },
    get settingsStore() {
      return settingsStore;
    },
    get settingsService() {
      return settingsService;
    },
    get deleteExecute() {
      return deleteExecute;
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
