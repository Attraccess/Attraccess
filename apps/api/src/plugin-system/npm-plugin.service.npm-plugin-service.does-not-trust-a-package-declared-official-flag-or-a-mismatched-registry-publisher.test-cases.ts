import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerDoesNotTrustAPackageDeclaredOfficialFlagOrAMismatchedRegistryPublisherCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('does not trust a package-declared official flag or a mismatched registry publisher', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      publisher: { username: 'someone-else' },
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@attraccess/plugin-example',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
          peerDependencies: { '@attraccess/plugins-backend-sdk': '*' },
          attraccess: {
            displayName: 'Example',
            host: '*',
            backend: 'dist/index.js',
            sdk: { backend: '*' },
            permissions: [],
            official: true,
          },
        },
      },
    });

    await expect(service.marketplacePackage('@attraccess/plugin-example')).resolves.toMatchObject({
      classification: 'community',
      classificationReason: 'Not published by Attraccess on npm',
    });
  });
}
