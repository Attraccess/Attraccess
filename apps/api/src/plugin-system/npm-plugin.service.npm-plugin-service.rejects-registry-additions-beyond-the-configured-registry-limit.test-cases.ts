import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { MAX_CONFIGURED_REGISTRIES, NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRejectsRegistryAdditionsBeyondTheConfiguredRegistryLimitCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rejects registry additions beyond the configured registry limit', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify(
          Array.from({ length: MAX_CONFIGURED_REGISTRIES }, (_, index) => ({
            id: `registry-${index}`,
            name: `Registry ${index}`,
            url: `https://registry-${index}.example.com`,
          })),
        ),
      ),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await expect(service.addRegistry({ name: 'Extra', url: 'https://extra.example.com' })).rejects.toThrow(
      `A maximum of ${MAX_CONFIGURED_REGISTRIES} registries can be configured`,
    );
    expect(settings.setPlainSetting).not.toHaveBeenCalled();
    expect(settings.setSecretSetting).not.toHaveBeenCalled();
  });
}
