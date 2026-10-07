import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRetainsHydratedMarketplacePackagesWhenAnotherResultNoLongerHasMetadataCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('retains hydrated marketplace packages when another result no longer has metadata', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [{ package: { name: '@example/stale' } }, { package: { name: '@example/plugin' } }],
      },
    });
    jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => {
      if (name === '@example/stale') throw new Error('Package no longer exists');
      return {
        'dist-tags': { latest: '1.2.3' },
        versions: {
          '1.2.3': {
            name: '@example/plugin',
            version: '1.2.3',
            keywords: ['attraccess-plugin'],
            peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
            attraccess: {
              displayName: 'Example Plugin',
              host: '*',
              backend: 'dist/index.js',
              sdk: { backend: '*' },
              permissions: [],
            },
          },
        },
      };
    });

    await expect(service.searchMarketplace('example')).resolves.toMatchObject({
      results: [expect.objectContaining({ name: '@example/plugin', installable: true })],
      errors: [],
    });
  });
}
