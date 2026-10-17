import { registerPushServiceFixture } from './push.service.push-service.test-fixture';
import { PUSH_KEYS, PUSH_PARENT } from './../settings/constants';
import { BadRequestException } from '@nestjs/common';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
describe('PushService', () => {
  const fixture = registerPushServiceFixture();

  describe('getVapidKeys', () => {
    it('returns the keys stored in the settings table', async () => {
      const service = await fixture.createService();
      fixture.givenStoredKeys('stored-public', 'stored-private');

      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'stored-public',
        privateKey: 'stored-private',
      });
      expect(fixture.mockedWebpush.generateVAPIDKeys).not.toHaveBeenCalled();
    });

    it('generates and persists a new key pair when none is stored', async () => {
      const service = await fixture.createService();
      fixture.givenStoredKeys(null, null);

      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'generated-public',
        privateKey: 'generated-private',
      });

      expect(fixture.settingsStore.setPlainSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPublicKey,
        'generated-public',
      );
      expect(fixture.settingsStore.setSecretSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPrivateKey,
        'generated-private',
      );
    });

    it('generates only once for concurrent callers', async () => {
      const service = await fixture.createService();
      fixture.givenStoredKeys(null, null);

      await Promise.all([service.getVapidKeys(), service.getVapidKeys()]);

      expect(fixture.mockedWebpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    });

    it('retries on the next call when loading fails', async () => {
      const service = await fixture.createService();
      fixture.settingsStore.getPlainSetting.mockRejectedValueOnce(new Error('db down'));
      fixture.settingsStore.getSecretSetting.mockResolvedValue({ value: null, configured: false });

      await expect(service.getVapidKeys()).rejects.toThrow('db down');

      fixture.givenStoredKeys('stored-public', 'stored-private');
      await expect(service.getVapidKeys()).resolves.toEqual({
        publicKey: 'stored-public',
        privateKey: 'stored-private',
      });
    });
  });

  describe('replaceVapidKeys', () => {
    it('regenerates the pair and deletes all subscriptions when no override is given', async () => {
      const service = await fixture.createService();
      fixture.subscriptionRepository.count.mockResolvedValue(3);

      const result = await service.replaceVapidKeys();

      expect(result).toEqual({
        keys: { publicKey: 'generated-public', privateKey: 'generated-private' },
        deletedSubscriptions: 3,
      });
      expect(fixture.deleteExecute).toHaveBeenCalled();
      expect(fixture.settingsStore.setPlainSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPublicKey,
        'generated-public',
      );
    });

    it('stores the provided custom key pair', async () => {
      const service = await fixture.createService();

      const result = await service.replaceVapidKeys({
        publicKey: fixture.VALID_PUBLIC_KEY,
        privateKey: fixture.VALID_PRIVATE_KEY,
      });

      expect(result.keys).toEqual({ publicKey: fixture.VALID_PUBLIC_KEY, privateKey: fixture.VALID_PRIVATE_KEY });
      expect(fixture.mockedWebpush.generateVAPIDKeys).not.toHaveBeenCalled();
      expect(fixture.settingsStore.setSecretSetting).toHaveBeenCalledWith(
        PUSH_PARENT,
        PUSH_KEYS.vapidPrivateKey,
        fixture.VALID_PRIVATE_KEY,
      );
    });

    it('serves the new public key immediately after replacement', async () => {
      const service = await fixture.createService();

      await service.replaceVapidKeys();

      await expect(service.getPublicKey()).resolves.toBe('generated-public');
      expect(fixture.settingsStore.getPlainSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid public key', 'not-a-key', fixture.VALID_PRIVATE_KEY],
      ['invalid private key', fixture.VALID_PUBLIC_KEY, 'not-a-key'],
    ])('rejects an override with an %s', async (_label, publicKey, privateKey) => {
      const service = await fixture.createService();

      await expect(service.replaceVapidKeys({ publicKey, privateKey })).rejects.toThrow(BadRequestException);
      expect(fixture.deleteExecute).not.toHaveBeenCalled();
      expect(fixture.settingsStore.setPlainSetting).not.toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('sends the payload to every subscription of the user with the stored VAPID details', async () => {
      const service = await fixture.createService();
      fixture.givenStoredKeys('stored-public', 'stored-private');
      fixture.settingsService.getSmtpConfiguration.mockResolvedValue({ from: 'push@makerspace.example.com' });
      const subscriptions = [
        fixture.makeSubscription({ id: 1, endpoint: 'https://push.example.com/sub-1' }),
        fixture.makeSubscription({ id: 2, endpoint: 'https://push.example.com/sub-2' }),
      ];
      fixture.subscriptionRepository.find.mockResolvedValue(subscriptions);
      fixture.mockedWebpush.sendNotification.mockResolvedValue({} as never);

      await service.sendToUser(42, { title: 'Hello', body: 'World', url: '/messages?conversation=1' });

      expect(fixture.subscriptionRepository.find).toHaveBeenCalledWith({ where: { userId: 42 } });
      expect(fixture.mockedWebpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(fixture.mockedWebpush.sendNotification).toHaveBeenCalledWith(
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
      const service = await fixture.createService();
      fixture.givenStoredKeys('stored-public', 'stored-private');
      fixture.settingsService.getSmtpConfiguration.mockResolvedValue({ from: '' });
      fixture.subscriptionRepository.find.mockResolvedValue([fixture.makeSubscription()]);
      fixture.mockedWebpush.sendNotification.mockResolvedValue({} as never);

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(fixture.mockedWebpush.sendNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          vapidDetails: expect.objectContaining({ subject: 'mailto:admin@localhost' }),
        }),
      );
    });

    it('does nothing when the user has no subscriptions', async () => {
      const service = await fixture.createService();
      fixture.subscriptionRepository.find.mockResolvedValue([]);

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(fixture.mockedWebpush.sendNotification).not.toHaveBeenCalled();
      expect(fixture.settingsStore.getPlainSetting).not.toHaveBeenCalled();
    });

    it.each([404, 410])('prunes the subscription when the push service responds with %s', async (statusCode) => {
      const service = await fixture.createService();
      fixture.givenStoredKeys('stored-public', 'stored-private');
      fixture.subscriptionRepository.find.mockResolvedValue([fixture.makeSubscription({ id: 7 })]);
      fixture.mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }));

      await service.sendToUser(42, { title: 'Hello', body: 'World' });

      expect(fixture.subscriptionRepository.delete).toHaveBeenCalledWith({ id: 7 });
    });

    it('keeps the subscription and does not throw on other send errors', async () => {
      const service = await fixture.createService();
      fixture.givenStoredKeys('stored-public', 'stored-private');
      fixture.subscriptionRepository.find.mockResolvedValue([fixture.makeSubscription({ id: 7 })]);
      fixture.mockedWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

      await expect(service.sendToUser(42, { title: 'Hello', body: 'World' })).resolves.toBeUndefined();

      expect(fixture.subscriptionRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('upsertSubscription', () => {
    it('creates a new subscription for an unknown endpoint', async () => {
      const service = await fixture.createService();
      fixture.subscriptionRepository.findOne.mockResolvedValue(null);

      await service.upsertSubscription(42, {
        endpoint: 'https://push.example.com/new',
        keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
        userAgent: 'TestBrowser/1.0',
      });

      expect(fixture.subscriptionRepository.save).toHaveBeenCalledWith(
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
      const service = await fixture.createService();
      const existing = fixture.makeSubscription({ id: 5, userId: 1, endpoint: 'https://push.example.com/sub-1' });
      fixture.subscriptionRepository.findOne.mockResolvedValue(existing);

      await service.upsertSubscription(42, {
        endpoint: 'https://push.example.com/sub-1',
        keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' },
      });

      expect(fixture.subscriptionRepository.create).not.toHaveBeenCalled();
      expect(fixture.subscriptionRepository.save).toHaveBeenCalledWith(
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
      const service = await fixture.createService();

      await service.deleteSubscription(42, 'https://push.example.com/sub-1');

      expect(fixture.subscriptionRepository.delete).toHaveBeenCalledWith({
        userId: 42,
        endpoint: 'https://push.example.com/sub-1',
      });
    });
  });
});
