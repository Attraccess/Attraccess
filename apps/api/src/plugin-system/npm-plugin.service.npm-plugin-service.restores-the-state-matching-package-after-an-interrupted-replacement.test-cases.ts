import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerRestoresTheStateMatchingPackageAfterAnInterruptedReplacementCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('restores the state-matching package after an interrupted replacement', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(fixture.root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = {};');
    writeFileSync(
      join(fixture.root, '.npm-plugin-state.json'),
      JSON.stringify([
        {
          name,
          version: '1.0.0',
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

    await service.onModuleInit();

    expect(existsSync(join(fixture.root, installPath, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(backup)).toBe(false);
  });
}
