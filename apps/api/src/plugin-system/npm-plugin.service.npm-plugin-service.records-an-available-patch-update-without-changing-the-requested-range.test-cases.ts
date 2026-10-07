import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRecordsAnAvailablePatchUpdateWithoutChangingTheRequestedRangeCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('records an available patch update without changing the requested range', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.2.0',
          requestedSpec: '^1.2.0',
          registryId: 'private',
          registryUrl: 'https://registry.example.com',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.1',
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
        semverImpact: 'patch',
        matchesRequestedSpec: true,
      },
    ]);

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      requestedSpec: '^1.2.0',
      updateCheck: { candidate: '1.2.1', state: 'available', error: null },
    });
  });
}
