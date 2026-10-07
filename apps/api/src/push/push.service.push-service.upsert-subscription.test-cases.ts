import { registerPushServiceFixture } from './push.service.push-service.test-fixture';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
export function registerUpsertSubscriptionCases(fixture: ReturnType<typeof registerPushServiceFixture>) {
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
}
