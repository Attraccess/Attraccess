import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import axios from 'axios';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerReturnsInvalidSearchCandidatesWithAnActionableIncompatibilityReasonCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('returns invalid search candidates with an actionable incompatibility reason', async () => {
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(null),
    } as never);
    const internals = service as unknown as ServiceInternals;
    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    fixture.lookupAll.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        objects: [
          {
            package: {
              name: '@example/not-a-plugin',
              version: '1.2.3',
            },
          },
        ],
      },
    });
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      'dist-tags': { latest: '1.2.3' },
      versions: {
        '1.2.3': {
          name: '@example/not-a-plugin',
          version: '1.2.3',
          keywords: [],
          attraccess: { displayName: 'Not a plugin', host: '*', official: true },
        },
      },
    });

    await expect(service.searchMarketplace('example')).resolves.toEqual({
      results: [
        expect.objectContaining({
          name: '@example/not-a-plugin',
          installable: false,
          incompatibilityReason: 'Package must include the attraccess-plugin keyword',
          classification: 'community',
        }),
      ],
      errors: [],
    });
  });
}
