import { registerPushServiceFixture } from './push.service.push-service.test-fixture';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
export function registerSendToUserCases(fixture: ReturnType<typeof registerPushServiceFixture>) {
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
}
