import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerKeepsARemovedNpmPluginQuarantinedWhenStatePersistenceFailsCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('keeps a removed npm plugin quarantined when state persistence fails', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
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
    mkdirSync(join(fixture.root, installPath), { recursive: true });
    writeFileSync(
      join(fixture.root, installPath, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.2.3',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      }),
    );
    const [plugin] = PluginService.getPlugins();
    PluginService.quarantinePlugin(plugin, new Error('prior crash'));
    const service = new NpmPluginService({} as never);
    jest
      .spyOn(service as unknown as { writeStateWithout(name: string): Promise<void> }, 'writeStateWithout')
      .mockRejectedValue(new Error('state write failed'));

    await expect(service.removeInstalled(name)).rejects.toThrow('state write failed');

    expect(PluginService.isPluginQuarantined(plugin)).toBe(true);
  });
}
