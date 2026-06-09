import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from '@attraccess/database-entities';
import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushConfigType } from '../config/push.config';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

describe('PushService', () => {
  let subscriptionRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  const enabledConfig: PushConfigType = {
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'mailto:admin@example.com',
    enabled: true,
  };

  const disabledConfig: PushConfigType = { enabled: false };

  async function createService(config: PushConfigType): Promise<PushService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getRepositoryToken(PushSubscription), useValue: subscriptionRepository },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(config) } },
      ],
    }).compile();

    return module.get<PushService>(PushService);
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
    subscriptionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      delete: jest.fn(),
    };
  });

  describe('configuration', () => {
    it('configures VAPID details when keys are set', async () => {
      const service = await createService(enabledConfig);

      expect(service.isEnabled).toBe(true);
      expect(service.getPublicKey()).toBe('public-key');
      expect(mockedWebpush.setVapidDetails).toHaveBeenCalledWith('mailto:admin@example.com', 'public-key', 'private-key');
    });

    it('degrades to disabled when keys are not set', async () => {
      const service = await createService(disabledConfig);

      expect(service.isEnabled).toBe(false);
      expect(service.getPublicKey()).toBeNull();
      expect(mockedWebpush.setVapidDetails).not.toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('sends the payload to every subscription of the user', async () => {
      const service = await createService(enabledConfig);
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
      );
    });

    it('does nothing when push is disabled', async () => {
      const service = await createService(disabledConfig);

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(subscriptionRepository.find).not.toHaveBeenCalled();
      expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it.each([404, 410])('prunes the subscription when the push service responds with %s', async (statusCode) => {
      const service = await createService(enabledConfig);
      subscriptionRepository.find.mockResolvedValue([makeSubscription({ id: 7 })]);
      mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(subscriptionRepository.delete).toHaveBeenCalledWith({ id: 7 });
    });

    it('keeps the subscription and does not throw on other send errors', async () => {
      const service = await createService(enabledConfig);
      subscriptionRepository.find.mockResolvedValue([makeSubscription({ id: 7 })]);
      mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

      await expect(service.sendToUser(42, { title: 'Hello', body: 'World' })).resolves.toBeUndefined();

      expect(subscriptionRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('upsertSubscription', () => {
    it('creates a new subscription for an unknown endpoint', async () => {
      const service = await createService(enabledConfig);
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
      const service = await createService(enabledConfig);
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
      const service = await createService(enabledConfig);

      await service.deleteSubscription(42, 'https://push.example.com/sub-1');

      expect(subscriptionRepository.delete).toHaveBeenCalledWith({
        userId: 42,
        endpoint: 'https://push.example.com/sub-1',
      });
    });
  });
});
