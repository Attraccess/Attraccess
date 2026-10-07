import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerClassifiesAnInstallationUsingTheSelectedVersionPublisherCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('classifies an installation using the selected version publisher', async () => {
    const name = '@attraccess/plugin-example';
    const tarball = await fixture.packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      maintainers: [{ name: 'attraccess' }],
      versions: {
        '1.2.3': {
          version: '1.2.3',
          _npmUser: { name: 'someone-else' },
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await expect(service.install(name, '1.2.3')).resolves.toMatchObject({
      classification: 'community',
      publisher: 'someone-else',
    });
  });
}
