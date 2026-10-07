import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerClassifiesAMajorPrereleaseAsAMajorUpdateCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('classifies a major prerelease as a major update', async () => {
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
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '2.0.0-beta.1': {
          name: '@attraccess/plugin',
          version: '2.0.0-beta.1',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: { displayName: 'Plugin', host: '*', backend: 'index.js', permissions: [], sdk: { backend: '*' } },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');

    await expect(service.installedVersionCandidates('@attraccess/plugin')).resolves.toEqual([
      expect.objectContaining({ version: '2.0.0-beta.1', semverImpact: 'major' }),
    ]);
  });
}
