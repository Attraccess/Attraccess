import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerDiscoversPluginsThroughRegistryKeywordSearchWithoutAHardcodedPackageListCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('discovers plugins through registry keyword search without a hardcoded package list', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [
          { package: { name: '@attraccess/plugin-example' } },
          // Registry search can report the same package twice; results are deduplicated.
          { package: { name: '@attraccess/plugin-example' } },
        ],
      },
    });
    const packageMetadata = jest.spyOn(service, 'packageMetadata').mockImplementation(async (name) => ({
      name,
      publisher: { username: 'attraccess' },
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name,
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: name,
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
        },
      },
    }));

    const result = await service.searchMarketplace('example');

    expect(result).toMatchObject({ errors: [] });
    expect(result.results).toEqual([
      expect.objectContaining({ name: '@attraccess/plugin-example', classification: 'official' }),
    ]);
    expect(packageMetadata).not.toHaveBeenCalledWith('@attraccess/plugin-other', 'npm');
  });
}
