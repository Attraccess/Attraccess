import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRetriesADistTagUpdateCheckAfterItsRequestedSpecChangesCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('retries a dist-tag update check after its requested spec changes', async () => {
    const name = '@attraccess/plugin';
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
          requestedSpec: 'next',
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
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    jest.spyOn(service, 'installedVersionCandidates').mockResolvedValue([
      {
        version: '1.2.0',
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
        semverImpact: 'minor',
        matchesRequestedSpec: false,
      },
    ]);
    let resolveNext: ((value: unknown) => void) | undefined;
    jest.spyOn(service, 'packageMetadata').mockImplementation(async () => {
      if (!resolveNext)
        return new Promise((resolve) => {
          resolveNext = resolve;
        });
      return { 'dist-tags': { latest: '1.2.0' }, versions: { '1.2.0': { version: '1.2.0' } } };
    });

    const updateCheck = service.checkInstalled(name);
    await new Promise((resolve) => setImmediate(resolve));
    const requestedSpecUpdate = service.updateRequestedSpec(name, 'latest');
    await new Promise((resolve) => setImmediate(resolve));
    resolveNext?.({ 'dist-tags': { next: '1.1.0' }, versions: { '1.1.0': { version: '1.1.0' } } });
    await requestedSpecUpdate;

    await expect(updateCheck).resolves.toMatchObject({
      requestedSpec: 'latest',
      updateCheck: { candidate: '1.2.0', state: 'available' },
    });
  });
}
