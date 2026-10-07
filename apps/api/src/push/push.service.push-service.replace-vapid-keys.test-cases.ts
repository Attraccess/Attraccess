import { BadRequestException } from '@nestjs/common';
import { PUSH_KEYS, PUSH_PARENT } from '../settings/constants';
import { registerPushServiceFixture } from './push.service.push-service.test-fixture';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
export function registerReplaceVapidKeysCases(fixture: ReturnType<typeof registerPushServiceFixture>) {
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
}
