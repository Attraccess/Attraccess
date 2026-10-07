import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerReturnsAnAttestationUrlWhenTheRegistryProvidesPackageProvenanceCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('returns an attestation URL when the registry provides package provenance', async () => {
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@example/plugin',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example Plugin',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
          },
          dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/@example%2Fplugin@1.2.3' } },
        },
      },
    });

    await expect(service.marketplacePackage('@example/plugin')).resolves.toMatchObject({
      provenance: 'https://registry.npmjs.org/-/npm/v1/attestations/@example%2Fplugin@1.2.3',
    });
  });
}
