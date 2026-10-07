import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerResolvesSemverRangesWhilePersistingTheRequestedSpecCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('resolves semver ranges while persisting the requested spec', async () => {
    const name = '@attraccess/plugin';
    const tarball = await fixture.packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: { tarball: 'older', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);

    await expect(service.install(name, '^1.0.0')).resolves.toMatchObject({ version: '1.2.3', requestedSpec: '^1.0.0' });
  });
}
