import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { createHash } from 'crypto';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerKeepsAPluginQuarantinedWhenItsFinalActiveStateCannotBePersistedCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('keeps a plugin quarantined when its final active state cannot be persisted', async () => {
    const name = '@attraccess/plugin';
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

    await expect(service.install(name, '1.2.3')).rejects.toThrow('final state write failed');

    expect(PluginService.isPluginQuarantined({ pluginDirectory: installPath })).toBe(true);
    PluginService.configure({ PLUGIN_DIR: fixture.root, RESTART_BY_EXIT: true });
    expect(PluginService.isPluginQuarantined({ pluginDirectory: installPath })).toBe(true);
  });
}
