import { PUSH_KEYS, PUSH_PARENT } from '../settings/constants';
import { registerPushServiceFixture } from './push.service.push-service.test-fixture';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  sendNotification: jest.fn(),
}));
export function registerGetVapidKeysCases(fixture: ReturnType<typeof registerPushServiceFixture>) {
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
}
