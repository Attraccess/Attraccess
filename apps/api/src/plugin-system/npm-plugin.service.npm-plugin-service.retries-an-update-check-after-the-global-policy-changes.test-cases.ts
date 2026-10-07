import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRetriesAnUpdateCheckAfterTheGlobalPolicyChangesCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('retries an update check after the global policy changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: '^1.0.0',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath: 'npm-plugin',
          permissions: [],
          lastError: null,
        },
      ]),
    );
    let rawPolicy = JSON.stringify({
      checksEnabled: true,
      mode: 'patch',
      prerelease: false,
      maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
    });
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockImplementation(async () => rawPolicy),
      setPlainSetting: jest.fn().mockImplementation(async (_parent, _key, value) => {
        rawPolicy = value;
      }),
    } as never);
    let releaseCandidates: ((value: never[]) => void) | undefined;
    jest
      .spyOn(service, 'installedVersionCandidates')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseCandidates = resolve;
          }),
      )
      .mockResolvedValue([
        {
          version: '1.0.1',
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
      ] as never);

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    await service.setUpdatePolicy({ mode: 'off' });
    if (!releaseCandidates) throw new Error('Expected update check to request candidates');
    releaseCandidates([]);

    await expect(updateCheck).resolves.toMatchObject({ updateCheck: { state: 'blocked' } });
  });
}
