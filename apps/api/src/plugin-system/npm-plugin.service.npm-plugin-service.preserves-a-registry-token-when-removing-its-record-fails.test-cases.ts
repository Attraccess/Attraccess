import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerPreservesARegistryTokenWhenRemovingItsRecordFailsCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('preserves a registry token when removing its record fails', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn().mockRejectedValue(new Error('database unavailable')),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.removeRegistry('private')).rejects.toThrow('database unavailable');

    expect(settings.setSecretSetting).not.toHaveBeenCalled();
  });
}
