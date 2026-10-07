import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerReplacesNewlyActivatedCodeWithTheStateMatchingBackupAfterACrashCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it('replaces newly activated code with the state-matching backup after a crash', async () => {
    const name = '@attraccess/plugin';
    const installPath = `npm-${Buffer.from(name).toString('base64url')}`;
    const backup = join(fixture.root, '.npm-backups', `${installPath}-00000000-0000-0000-0000-000000000000`);
    mkdirSync(join(backup, 'dist'), { recursive: true });
    writeFileSync(join(backup, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    writeFileSync(join(backup, 'dist', 'index.js'), 'module.exports = "1.0.0";');
    mkdirSync(join(fixture.root, installPath, 'dist'), { recursive: true });
    writeFileSync(join(fixture.root, installPath, 'plugin.json'), JSON.stringify({ name, version: '2.0.0' }));
    writeFileSync(join(fixture.root, installPath, 'dist', 'index.js'), 'module.exports = "2.0.0";');
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

    await NpmPluginService.recoverBackups();

    expect(readFileSync(join(fixture.root, installPath, 'dist', 'index.js'), 'utf8')).toBe('module.exports = "1.0.0";');
    expect(existsSync(backup)).toBe(false);
  });
}
