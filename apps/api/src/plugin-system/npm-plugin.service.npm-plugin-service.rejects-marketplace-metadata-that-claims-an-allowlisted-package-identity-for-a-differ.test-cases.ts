import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRejectsMarketplaceMetadataThatClaimsAnAllowlistedPackageIdentityForADifferCases(
  _fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rejects marketplace metadata that claims an allowlisted package identity for a different request', async () => {
    const service = new NpmPluginService({ getPlainSetting: jest.fn().mockResolvedValue(null) } as never);
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      name: '@example/community-plugin',
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@attraccess/plugin-example',
          version: '1.2.3',
          keywords: ['attraccess-plugin'],
        },
      },
    });

    await expect(service.marketplacePackage('@example/community-plugin')).rejects.toThrow(
      'Registry metadata identity does not match the requested package',
    );
  });
}
