import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRequiresTheExactPermissionAdditionsBeforeReplacingAnInstalledPackageCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('requires the exact permission additions before replacing an installed package', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name: '@attraccess/plugin',
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
        version: '1.1.0',
        publishedAt: null,
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: ['READ_USERS'],
        permissionAdditions: ['READ_USERS'],
        permissionRemovals: [],
      },
    ]);

    await expect(service.replaceInstalled('@attraccess/plugin', '1.1.0')).rejects.toThrow(
      'Permission approval required for: READ_USERS',
    );
  });
}
