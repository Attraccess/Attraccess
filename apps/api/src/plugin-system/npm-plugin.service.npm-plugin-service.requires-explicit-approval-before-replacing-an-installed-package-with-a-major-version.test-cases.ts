import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRequiresExplicitApprovalBeforeReplacingAnInstalledPackageWithAMajorVersionCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('requires explicit approval before replacing an installed package with a major version', async () => {
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
        version: '2.0.0',
        direction: 'newer',
        compatible: true,
        reason: null,
        permissions: [],
        permissionAdditions: [],
        permissionRemovals: [],
        publishedAt: null,
        classification: 'community',
        classificationReason: '',
        deprecated: null,
        integrity: 'sha512-test',
        repository: null,
        homepage: null,
        semverImpact: 'major',
        matchesRequestedSpec: true,
      },
    ]);

    await expect(service.replaceInstalled('@attraccess/plugin', '2.0.0')).rejects.toThrow(
      'Explicit approval is required for a major version update',
    );
  });
}
