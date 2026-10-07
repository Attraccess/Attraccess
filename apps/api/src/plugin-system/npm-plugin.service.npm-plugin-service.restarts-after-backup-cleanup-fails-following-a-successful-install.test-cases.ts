import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRestartsAfterBackupCleanupFailsFollowingASuccessfulInstallCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('restarts after backup cleanup fails following a successful install', async () => {
    const name = '@attraccess/plugin';
    const tarball = await fixture.packageTarball(name);
    const target = join(fixture.root, `npm-${Buffer.from(name).toString('base64url')}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
        permissions: [],
      }),
    );
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals;

    jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
    jest.spyOn(service, 'packageMetadata').mockResolvedValue({
      versions: {
        '1.2.3': {
          version: '1.2.3',
          dist: { tarball: 'plugin', shasum: createHash('sha1').update(tarball).digest('hex') },
        },
      },
    });
    jest.spyOn(internals, 'download').mockResolvedValue(tarball);
    jest.spyOn(internals, 'removeBackup').mockRejectedValue(new Error('cleanup failed'));

    await expect(service.install(name, '1.2.3')).resolves.toMatchObject({ name, version: '1.2.3' });

    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
    expect(service.listInstalled()).toEqual([expect.objectContaining({ name, version: '1.2.3' })]);
    expect(readdirSync(join(fixture.root, '.npm-backups'))).toHaveLength(1);

    await service.onModuleInit();

    expect(existsSync(join(fixture.root, '.npm-backups'))).toBe(false);
  });
}
