import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRemovesTheRegistryRecordBeforeDeletingItsTokenCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('removes the registry record before deleting its token', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);

    await service.removeRegistry('private');

    expect(settings.setPlainSetting.mock.invocationCallOrder[0]).toBeLessThan(
      settings.setSecretSetting.mock.invocationCallOrder[0],
    );
  });
}
