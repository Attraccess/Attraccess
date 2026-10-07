import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerReturnsRegistryMetadataWithoutItsStoredTokenCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('returns registry metadata without its stored token', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'Private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: 'secret', configured: true }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.listRegistries()).resolves.toEqual([
      { id: 'private', name: 'Private', url: 'https://registry.example.com', tokenConfigured: true },
    ]);
  });
}
