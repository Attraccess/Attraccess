import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerPinsMetadataRequestsToPublicRegistryAddressesAndLimitsTheirSizeCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('pins metadata requests to public registry addresses and limits their size', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest.fn(),
      getSecretSetting: jest.fn(),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const axiosGet = jest.spyOn(axios, 'get').mockResolvedValue({ data: { versions: {} } });
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

    await service.packageMetadata('example');

    expect(axiosGet).toHaveBeenCalledWith(
      'https://registry.npmjs.org/example',
      expect.objectContaining({ maxContentLength: 10 * 1024 * 1024, maxRedirects: 0 }),
    );
    const options = axiosGet.mock.calls[0]?.[1];
    if (!options?.lookup) throw new Error('Expected metadata request to pin DNS lookup');
    const callback = jest.fn();
    options.lookup('registry.npmjs.org', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
  });
}
