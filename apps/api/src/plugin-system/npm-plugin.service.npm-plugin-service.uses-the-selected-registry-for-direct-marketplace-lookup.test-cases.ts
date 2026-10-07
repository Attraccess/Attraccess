import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerUsesTheSelectedRegistryForDirectMarketplaceLookupCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('uses the selected registry for direct marketplace lookup', async () => {
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
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@private/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Private Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    });

    await expect(service.marketplacePackage('@private/plugin', 'private')).resolves.toMatchObject({
      name: '@private/plugin',
      registry: { id: 'private', name: 'Private' },
      installable: true,
    });
    expect(service.packageMetadata).toHaveBeenCalledWith('@private/plugin', 'private');
  });
}
