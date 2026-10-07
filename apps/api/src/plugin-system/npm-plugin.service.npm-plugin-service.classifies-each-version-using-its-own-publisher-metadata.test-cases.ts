import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerClassifiesEachVersionUsingItsOwnPublisherMetadataCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('classifies each version using its own publisher metadata', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name: '@attraccess/plugin-example',
          version: '1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
          publisher: 'attraccess',
        },
      ]),
    );
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      publisher: { name: 'attraccess' },
      versions: {
        '1.1.0': {
          name: '@attraccess/plugin-example',
          version: '1.1.0',
          _npmUser: { name: 'unapproved-publisher' },
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example',
            host: '*',
            backend: 'index.js',
            permissions: [],
            sdk: { backend: '*' },
          },
        },
      },
    });
    jest.spyOn(service as unknown as ServiceInternals, 'hostVersion').mockReturnValue('1.9.0');

    await expect(service.installedVersionCandidates('@attraccess/plugin-example')).resolves.toEqual([
      expect.objectContaining({
        version: '1.1.0',
        classification: 'community',
        classificationReason: 'Not published by Attraccess on npm',
      }),
    ]);
  });
}
