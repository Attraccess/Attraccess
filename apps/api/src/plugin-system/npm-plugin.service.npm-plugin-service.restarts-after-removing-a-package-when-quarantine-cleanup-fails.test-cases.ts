import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRestartsAfterRemovingAPackageWhenQuarantineCleanupFailsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('restarts after removing a package when quarantine cleanup fails', async () => {
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
    jest.spyOn(PluginService, 'clearPluginQuarantine').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });
    const service = new NpmPluginService({} as never);

    await expect(service.removeInstalled(name)).resolves.toBeUndefined();

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(service.listInstalled()).toEqual([]);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });
}
