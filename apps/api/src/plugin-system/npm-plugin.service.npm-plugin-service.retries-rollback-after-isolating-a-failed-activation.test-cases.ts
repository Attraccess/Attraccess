import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRetriesRollbackAfterIsolatingAFailedActivationCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('retries rollback after isolating a failed activation', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const tarball = await fixture.packageTarball(name);
    const service = new NpmPluginService({} as never);
    const internals = service as unknown as ServiceInternals & {
      rollbackActivation(activation: { target: string; backup: string }): Promise<void>;
    };

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
    jest
      .spyOn(internals, 'writeState')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('final state write failed'));
    jest.spyOn(PluginService, 'quarantinePluginDirectory').mockImplementation(() => {
      throw new Error('quarantine write failed');
    });
    const rollbackActivation = internals.rollbackActivation.bind(service);
    const rollback = jest
      .spyOn(internals, 'rollbackActivation')
      .mockRejectedValueOnce(new Error('rollback failed'))
      .mockImplementation(rollbackActivation);

    await expect(service.install(name, '1.2.3')).rejects.toThrow('final state write failed');

    expect(rollback).toHaveBeenCalledTimes(2);
    expect(existsSync(join(fixture.root, installPath))).toBe(false);
    expect(readdirSync(join(fixture.root, '.npm-backups')).some((entry) => entry.startsWith('failed-'))).toBe(true);
  });
}
