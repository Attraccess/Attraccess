import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRollsBackAnActivationWhenItsQuarantineFallbackCannotBePersistedCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rolls back an activation when its quarantine fallback cannot be persisted', async () => {
    const name = '@attraccess/plugin';
    const audit = fixture.auditState();
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
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
    const writeState = internals.writeState.bind(service);
    jest
      .spyOn(internals, 'writeState')
      .mockImplementationOnce(writeState)
      .mockRejectedValueOnce(new Error('final state write failed'));
    jest.spyOn(PluginService, 'quarantinePluginDirectory').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });

    await expect(service.install(name, '1.2.3', undefined, audit)).rejects.toThrow('final state write failed');

    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(audit).toMatchObject({
      integrityResult: 'verified',
      activationOutcome: 'failed',
      rollbackOutcome: 'succeeded',
      restartRequested: 0,
    });
    expect(service.listInstalled()).toEqual([]);
  });
}
