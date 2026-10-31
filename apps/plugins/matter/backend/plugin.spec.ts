import { COMPATIBILITY_TABLE, minimumAttraccessVersion } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import plugin from './plugin';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', name), 'utf8'));

describe('matter plugin foundation', () => {
  it('registers an empty module: no controllers, providers or imports', () => {
    const module = plugin.register({} as never);
    expect(Object.keys(module)).toEqual(['module']);
  });

  it('declares no permissions, frontend, migrations or SDK frontend dependency', () => {
    const pkg = read('package.json');
    const manifest = read('plugin.json');
    expect(pkg.attraccess.permissions).toEqual([]);
    expect(manifest.permissions).toEqual([]);
    expect(pkg.attraccess.frontend).toBeUndefined();
    expect(pkg.attraccess.migrations).toBeUndefined();
    expect(manifest.main.frontend).toBeUndefined();
    expect(pkg.peerDependencies).toEqual({ '@attraccess/plugins-backend-sdk': '^1.9.0' });
  });
});

describe('host-version declarations', () => {
  const combination = COMPATIBILITY_TABLE[0];

  it('derive from the compatibility table in package.json and plugin.json', () => {
    expect(read('package.json').attraccess.host).toBe(combination.attraccess);
    expect(read('plugin.json').attraccessVersion).toEqual({ min: minimumAttraccessVersion(combination) });
  });

  it('use the plugin release listed in the table', () => {
    expect(read('package.json').version).toBe(combination.plugin);
    expect(read('plugin.json').version).toBe(combination.plugin);
  });
});
