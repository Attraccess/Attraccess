import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerPinsTarballDnsOnEverySameOriginRedirectAndReturnsArchiveBytesCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('pins tarball DNS on every same-origin redirect and returns archive bytes', async () => {
    const service = new NpmPluginService({} as never) as unknown as {
      download: (url: string, registry: { url: string; token: string | null }) => Promise<Buffer>;
    };
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ status: 302, headers: { location: '/archive.tgz' } })
      .mockResolvedValueOnce({ status: 200, data: Buffer.from('archive') });
    expect(
      await service.download('https://registry.npmjs.org/start', {
        url: 'https://registry.npmjs.org',
        token: 'test-token',
      }),
    ).toEqual(Buffer.from('archive'));
    expect(get).toHaveBeenNthCalledWith(
      2,
      'https://registry.npmjs.org/archive.tgz',
      expect.objectContaining({ maxRedirects: 0, headers: { authorization: 'Bearer test-token' } }),
    );
    const options = get.mock.calls[0][1];
    const callback = jest.fn();
    if (!options?.lookup) throw new Error('Missing pinned lookup');
    options.lookup('registry.npmjs.org', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    options.lookup('other.example', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(expect.any(Error), '', 4);
    expect(options.validateStatus?.(200)).toBe(true);
    expect(options.validateStatus?.(404)).toBe(false);
  });
}
