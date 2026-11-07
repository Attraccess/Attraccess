import { COMPATIBILITY_TABLE, minimumAttraccessVersion } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import plugin from './plugin';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterConnection } from './connection/entity';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', name), 'utf8'));

describe('matter plugin backend', () => {
  it('registers the settings controller, its services, the entity and the audit domain', () => {
    const module = plugin.register({} as never);
    expect(module.controllers).toEqual([MatterConnectionController]);
    expect(module.providers).toHaveLength(3);
    expect(plugin.entities).toEqual([MatterConnection]);
    expect(plugin.auditDomains).toEqual([MATTER_AUDIT_DOMAIN]);
  });

  it('declares exactly the permissions it uses, a migrations entry and a frontend entry', () => {
    const pkg = read('package.json');
    const manifest = read('plugin.json');
    expect(pkg.attraccess.permissions).toEqual(['DATABASE_ACCESS', 'MANAGE_SECRETS']);
    expect(manifest.permissions).toEqual(['DATABASE_ACCESS', 'MANAGE_SECRETS']);
    expect(pkg.attraccess.migrations).toBe('dist/migrations.js');
    expect(manifest.main.migrations).toEqual({ directory: 'dist', entryPoint: 'migrations.js' });
    expect(pkg.attraccess.frontend).toBe('frontend/remoteEntry.js');
    expect(manifest.main.frontend).toMatchObject({ entryPoint: 'remoteEntry.js' });
  });

  it('declares an audit policy with no free-form detail fields', () => {
    const details = MATTER_AUDIT_DOMAIN.actions.flatMap((action) => Object.values(action.details ?? {}));
    expect(details.every((field) => field.type === 'boolean' || field.oneOf !== undefined)).toBe(true);
  });
});

describe('host-version declarations', () => {
  const combination = COMPATIBILITY_TABLE[0];

  it('derive from the compatibility table in package.json and plugin.json', () => {
    expect(read('package.json').attraccess.host).toBe(combination.attraccess);
    expect(read('plugin.json').attraccessVersion).toEqual({ min: minimumAttraccessVersion(combination) });
  });

  it('use the plugin release listed in the table', () => {
    expect(combination.plugin).toBe('0.2.0-alpha.0');
    expect(read('package.json').version).toBe(combination.plugin);
    expect(read('plugin.json').version).toBe(combination.plugin);
  });
});
