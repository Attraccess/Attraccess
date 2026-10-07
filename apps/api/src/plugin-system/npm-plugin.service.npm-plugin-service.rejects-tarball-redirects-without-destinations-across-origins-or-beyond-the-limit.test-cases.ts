import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRejectsTarballRedirectsWithoutDestinationsAcrossOriginsOrBeyondTheLimitCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rejects tarball redirects without destinations, across origins, or beyond the limit', async () => {
    const service = new NpmPluginService({} as never) as unknown as {
      download: (url: string, registry: { url: string; token: string | null }) => Promise<Buffer>;
    };
    const registry = { url: 'https://registry.npmjs.org', token: null };
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const get = jest.spyOn(axios, 'get').mockResolvedValueOnce({ status: 302, headers: {} });
    await expect(service.download(registry.url, registry)).rejects.toThrow('no destination');
    get.mockResolvedValueOnce({ status: 302, headers: { location: 'https://other.example/archive' } });
    await expect(service.download(registry.url, registry)).rejects.toThrow('configured registry origin');
    get.mockResolvedValue({ status: 302, headers: { location: '/again' } });
    await expect(service.download(registry.url, registry)).rejects.toThrow('redirect limit');
  });
}
