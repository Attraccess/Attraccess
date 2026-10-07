import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerSkipsRegistryUpdateChecksWhenChecksAreDisabledGloballyCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('skips registry update checks when checks are disabled globally', async () => {
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
    const service = new NpmPluginService({
      getPlainSetting: jest.fn().mockResolvedValue(
        JSON.stringify({
          checksEnabled: false,
          mode: 'patch',
          prerelease: false,
          maintenanceWindow: { startMinute: 0, durationMinutes: 60 },
        }),
      ),
    } as never);
    const candidates = jest.spyOn(service, 'installedVersionCandidates');

    await expect(service.checkInstalled(name)).resolves.toMatchObject({
      name,
      updateCheck: null,
    });
    expect(candidates).not.toHaveBeenCalled();
  });
}
