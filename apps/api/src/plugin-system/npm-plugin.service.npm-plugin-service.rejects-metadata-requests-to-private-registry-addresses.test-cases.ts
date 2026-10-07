import type { SettingsMock } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRejectsMetadataRequestsToPrivateRegistryAddressesCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rejects metadata requests to private registry addresses', async () => {
    const settings: SettingsMock = {
      getPlainSetting: jest
        .fn()
        .mockResolvedValue(JSON.stringify([{ id: 'private', name: 'private', url: 'http://private.test' }])),
      getSecretSetting: jest.fn().mockResolvedValue({ value: null, configured: false }),
      setPlainSetting: jest.fn(),
      setSecretSetting: jest.fn(),
    };
    const service = new NpmPluginService(settings as unknown as never);
    const axiosGet = jest.spyOn(axios, 'get');
    fixture.lookupAll.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(service.packageMetadata('example', 'private')).rejects.toThrow('public addresses');
    expect(axiosGet).not.toHaveBeenCalled();
  });
}
