import { registerPushServiceFixture } from './push.service.push-service.test-fixture';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
export function registerDeleteSubscriptionCases(fixture: ReturnType<typeof registerPushServiceFixture>) {
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
}
