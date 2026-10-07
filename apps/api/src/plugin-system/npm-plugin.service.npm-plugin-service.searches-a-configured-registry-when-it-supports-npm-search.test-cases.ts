import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerSearchesAConfiguredRegistryWhenItSupportsNpmSearchCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('searches a configured registry when it supports npm search', async () => {
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
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const axiosGet = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { objects: [{ package: { name: '@private/plugin' } }] },
    });
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

    const result = await service.searchMarketplace('private', 'private');

    expect(result.errors).toEqual([]);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '@private/plugin', registry: expect.objectContaining({ id: 'private' }) }),
      ]),
    );
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('https://registry.example.com/-/v1/search?text='),
      expect.anything(),
    );
    expect(service.packageMetadata).toHaveBeenCalledWith('@private/plugin', 'private');
  });
}
