import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRemovesNpmPackageCodeAndItsInstallationRecordWithoutRevertingMigrationsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('removes npm package code and its installation record without reverting migrations', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    mkdirSync(join(fixture.root, installPath), { recursive: true });
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.2.3',
          registryId: 'npm',
          registryUrl: 'https://registry.npmjs.org',
          integrity: 'sha512-test',
          installPath,
          permissions: [],
          lastError: null,
        },
      ]),
    );
    const service = new NpmPluginService({} as never);

    await service.removeInstalled(name);

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });
}
