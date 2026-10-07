import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerPersistsAnExactPrivateRegistryInstallationAcrossServiceRestartCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('persists an exact private-registry installation across service restart', async () => {
    const name = '@private/plugin';
    const tarball = await fixture.packageTarball(name);
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'Private', url: 'https://registry.example.com' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await service.install(name, '1.2.3', 'private');

    expect(new NpmPluginService(settings as unknown as never).listInstalled()).toEqual([
      expect.objectContaining({ name, version: '1.2.3', registryId: 'private' }),
    ]);
  });
}
