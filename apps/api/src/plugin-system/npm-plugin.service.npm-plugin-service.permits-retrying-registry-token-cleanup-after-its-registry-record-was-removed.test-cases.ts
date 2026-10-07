import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerPermitsRetryingRegistryTokenCleanupAfterItsRegistryRecordWasRemovedCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('permits retrying registry token cleanup after its registry record was removed', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn().mockResolvedValue(null),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await service.removeRegistry('orphaned');

    expect(settings.setSecretSetting).toHaveBeenCalledWith('plugin-registry', 'orphaned:token', null);
  });
}
