import { writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRejectsReplacingAnInstalledPackageThroughTheInstallEndpointCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('rejects replacing an installed package through the install endpoint', async () => {
    const service = new NpmPluginService({} as never);
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([{ name: '@attraccess/plugin', version: '1.0.0' }]),
    );

    await expect(service.install('@attraccess/plugin', '1.1.0')).rejects.toThrow(
      'Package is already installed; use the replacement endpoint',
    );
  });
}
