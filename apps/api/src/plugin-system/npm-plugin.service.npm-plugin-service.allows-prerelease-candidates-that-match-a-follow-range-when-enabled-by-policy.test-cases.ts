import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerAllowsPrereleaseCandidatesThatMatchAFollowRangeWhenEnabledByPolicyCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('allows prerelease candidates that match a follow range when enabled by policy', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '2.0.0-beta.1',
          requestedSpec: '^2.0.0-beta.1',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: true,
          mode: 'follow',
          prerelease: true,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '2.0.0-beta.2',
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
        semverImpact: 'prerelease',
        matchesRequestedSpec: false,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      updateCheck: { candidate: '2.0.0-beta.2', state: 'available' },
    });
  });
}
