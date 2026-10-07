import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerReturnsAQuarantinedInstallWhenQuarantineCleanupFailsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('returns a quarantined install when quarantine cleanup fails', async () => {
    const name = '@attraccess/plugin';
    const audit = fixture.auditState();
    const tarball = await fixture.packageTarball(name);
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
    jest.spyOn(PluginService, 'clearPluginQuarantine').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });

    await expect(service.install(name, '1.2.3', undefined, audit)).resolves.toMatchObject({
      name,
      version: '1.2.3',
      state: 'quarantined',
      lastError: expect.stringContaining('quarantine cleanup failed'),
    });

    expect(audit).toMatchObject({
      integrityResult: 'verified',
      activationOutcome: 'quarantined',
      migrationOutcome: 'not-run',
      restartRequested: 1,
    });
    expect(service.listInstalled()).toEqual([
      expect.objectContaining({
        state: 'quarantined',
        lastError: expect.stringContaining('quarantine cleanup failed'),
      }),
    ]);
    expect(existsSync(join(fixture.root, `npm-${Buffer.from(name).toString('base64url')}`))).toBe(true);
    expect(PluginService.prototype.requestRestart).toHaveBeenCalled();
  });
}
