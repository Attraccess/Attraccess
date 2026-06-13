import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PushSubscription } from '@attraccess/database-entities';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PUSH_KEYS, PUSH_PARENT } from '../settings/constants';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

// Real base64url-encoded P-256 key lengths (65 / 32 bytes).
const VALID_PUBLIC_KEY = Buffer.alloc(65, 4).toString('base64url');
const VALID_PRIVATE_KEY = Buffer.alloc(32, 7).toString('base64url');

describe('PushService', () => {
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

  describe('getVapidKeys', () => {
    it('returns the keys stored in the settings table', async () => {
      const service = await createService();
      givenStoredKeys('stored-public', 'stored-private');

      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'stored-public',
        privateKey: 'stored-private',
      });
      expect(mockedWebpush.generateVAPIDKeys).not.toHaveBeenCalled();
    });

    it('generates and persists a new key pair when none is stored', async () => {
      const service = await createService();
      givenStoredKeys(null, null);

      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'generated-public',
        privateKey: 'generated-private',
      });

      expect(settingsStore.setPlainSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPublicKey,
        'generated-public',
      );
      expect(settingsStore.setSecretSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPrivateKey,
        'generated-private',
      );
    });

    it('generates only once for concurrent callers', async () => {
      const service = await createService();
      givenStoredKeys(null, null);

      await Promise.all([service.getVapidKeys(), service.getVapidKeys()]);

      expect(mockedWebpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    });

    it('retries on the next call when loading fails', async () => {
      const service = await createService();
      settingsStore.getPlainSetting.mockRejectedValueOnce(new Error('db down'));
      settingsStore.getSecretSetting.mockResolvedValue({ value: null, configured: false });

      await expect(service.getVapidKeys()).rejects.toThrow('db down');

      givenStoredKeys('stored-public', 'stored-private');
      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'stored-public',
        privateKey: 'stored-private',
      });
    });
  });

  describe('replaceVapidKeys', () => {
    it('regenerates the pair and deletes all subscriptions when no override is given', async () => {
      const service = await createService();
      subscriptionRepository.count.mockResolvedValue(3);

      const result = await service.replaceVapidKeys();

      expect(result).toEqual({
        keys: { publicKey: 'generated-public', privateKey: 'generated-private' },
        deletedSubscriptions: 3,
      });
      expect(deleteExecute).toHaveBeenCalled();
      expect(settingsStore.setPlainSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPublicKey,
        'generated-public',
      );
    });

    it('stores the provided custom key pair', async () => {
      const service = await createService();

      const result = await service.replaceVapidKeys({
        publicKey: VALID_PUBLIC_KEY,
        privateKey: VALID_PRIVATE_KEY,
      });

      expect(result.keys).toEqual({ publicKey: VALID_PUBLIC_KEY, privateKey: VALID_PRIVATE_KEY });
      expect(mockedWebpush.generateVAPIDKeys).not.toHaveBeenCalled();
      expect(settingsStore.setSecretSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPrivateKey,
        VALID_PRIVATE_KEY,
      );
    });

    it('serves the new public key immediately after replacement', async () => {
      const service = await createService();

      await service.replaceVapidKeys();

      await expect(service.getPublicKey()).resolves.toBe('generated-public');
      expect(settingsStore.getPlainSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid public key', 'not-a-key', VALID_PRIVATE_KEY],
      ['invalid private key', VALID_PUBLIC_KEY, 'not-a-key'],
    ])('rejects an override with an %s', async (_label, publicKey, privateKey) => {
      const service = await createService();

      await expect(service.replaceVapidKeys({ publicKey, privateKey })).rejects.toThrow(BadRequestException);
      expect(deleteExecute).not.toHaveBeenCalled();
      expect(settingsStore.setPlainSetting).not.toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('sends the payload to every subscription of the user with the stored VAPID details', async () => {
      const service = await createService();
      givenStoredKeys('stored-public', 'stored-private');
      settingsService.getSmtpConfiguration.mockResolvedValue({ from: 'push@makerspace.example.com' });
      const subscriptions = [
        makeSubscription({ id: 1, endpoint: 'https://push.example.com/sub-1' }),
        makeSubscription({ id: 2, endpoint: 'https://push.example.com/sub-2' }),
      ];
      subscriptionRepository.find.mockResolvedValue(subscriptions);
      mockedWebpush.sendNotification.mockResolvedValue({} as never);

      await service.sendToUser(42, { title: 'Hello', body: 'World', url: '/messages?conversation=1' });

      expect(subscriptionRepository.find).toHaveBeenCalledWith({ where: { userId: 42 } });
      expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/sub-1',
          keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
        },
        JSON.stringify({ title: 'Hello', body: 'World', url: '/messages?conversation=1' }),
        {
          vapidDetails: {
            subject: 'mailto:push@makerspace.example.com',
            publicKey: 'stored-public',
            privateKey: 'stored-private',
          },
        },
      );
    });

    it('falls back to a default mailto subject when no SMTP from address is configured', async () => {
      const service = await createService();
      givenStoredKeys('stored-public', 'stored-private');
      settingsService.getSmtpConfiguration.mockResolvedValue({ from: '' });
      subscriptionRepository.find.mockResolvedValue([makeSubscription()]);
      mockedWebpush.sendNotification.mockResolvedValue({} as never);

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          vapidDetails: expect.objectContaining({ subject: 'mailto:admin@localhost' }),
        }),
      );
    });

    it('does nothing when the user has no subscriptions', async () => {
      const service = await createService();
      subscriptionRepository.find.mockResolvedValue([]);

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
      expect(settingsStore.getPlainSetting).not.toHaveBeenCalled();
    });

    it.each([404, 410])('prunes the subscription when the push service responds with %s', async (statusCode) => {
      const service = await createService();
      givenStoredKeys('stored-public', 'stored-private');
      subscriptionRepository.find.mockResolvedValue([makeSubscription({ id: 7 })]);
      mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(subscriptionRepository.delete).toHaveBeenCalledWith({ id: 7 });
    });

    it('keeps the subscription and does not throw on other send errors', async () => {
      const service = await createService();
      givenStoredKeys('stored-public', 'stored-private');
      subscriptionRepository.find.mockResolvedValue([makeSubscription({ id: 7 })]);
      mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

      await expect(service.sendToUser(42, { title: 'Hello', body: 'World' })).resolves.toBeUndefined();

      expect(subscriptionRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('upsertSubscription', () => {
    it('creates a new subscription for an unknown endpoint', async () => {
      const service = await createService();
      subscriptionRepository.findOne.mockResolvedValue(null);

      await service.upsertSubscription(42, {
        endpoint: 'https://push.example.com/new',
        keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
        userAgent: 'TestBrowser/1.0',
      });

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://push.example.com/new',
          userId: 42,
          p256dh: 'new-p256dh',
          auth: 'new-auth',
          userAgent: 'TestBrowser/1.0',
          lastSeenAt: expect.any(Date),
        }),
      );
    });

    it('updates the existing subscription for a known endpoint (re-subscribe / user switch)', async () => {
      const service = await createService();
      const existing = makeSubscription({ id: 5, userId: 1, endpoint: 'https://push.example.com/sub-1' });
      subscriptionRepository.findOne.mockResolvedValue(existing);

      await service.upsertSubscription(42, {
        endpoint: 'https://push.example.com/sub-1',
        keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' },
      });

      expect(subscriptionRepository.create).not.toHaveBeenCalled();
      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          userId: 42,
          p256dh: 'rotated-p256dh',
          auth: 'rotated-auth',
        }),
      );
    });
  });

  describe('deleteSubscription', () => {
    it('deletes only the subscription of the requesting user', async () => {
      const service = await createService();

      await service.deleteSubscription(42, 'https://push.example.com/sub-1');

      expect(subscriptionRepository.delete).toHaveBeenCalledWith({
        userId: 42,
        endpoint: 'https://push.example.com/sub-1',
      });
    });
  });
});
