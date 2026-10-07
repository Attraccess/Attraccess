import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRequiresApprovalForPermissionsDeclaredByTheDownloadedReplacementTarballCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('requires approval for permissions declared by the downloaded replacement tarball', async () => {
    const name = '@attraccess/plugin';
    const tarball = await fixture.packageTarball(name, ['READ_USERS']);
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.3',
        publishedAt: null,
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
      },
    ]);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service as unknown as ServiceInternals, 'download').mockResolvedValue(tarball);

    await expect(service.replaceInstalled(name, '1.2.3', [])).rejects.toThrow(
      'Permission approval required for: READ_USERS',
    );
  });
}
