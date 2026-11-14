import { COMPATIBILITY_TABLE, minimumAttraccessVersion } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import plugin from './plugin';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterBackupController } from './backup/controller';
import { BACKUP_ENTITIES } from './backup/entities';
import { MatterFabricController } from './fabric/controller';
import { MatterDevicesController } from './devices/controller';
import { DEVICE_ENTITIES } from './devices/entities';
import { MatterConnection } from './connection/entity';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', name), 'utf8'));

describe('matter plugin backend', () => {
  it('registers the controllers, the services, the entities and the audit domain', () => {
    const module = plugin.register({} as never);
    expect(module.controllers).toEqual([
      MatterConnectionController,
      MatterDevicesController,
      MatterFabricController,
      MatterBackupController,
    ]);
    expect(module.providers).toHaveLength(15);
    expect(plugin.entities).toEqual([MatterConnection, ...DEVICE_ENTITIES, ...BACKUP_ENTITIES]);
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
    // Flags, closed value sets, bounded numbers, or an ID shape: never free text from a device or a user.
    const bounded = (field: (typeof details)[number]) =>
      field.type === 'boolean' ||
      field.oneOf !== undefined ||
      (field.type === 'number' && field.integer === true) ||
      (field.type === 'string' && /^\[(0-9a-f-|0-9)\]/.test(field.pattern ?? ''));
    expect(details.every(bounded)).toBe(true);
  });

  it('audits every device lifecycle action on a node, endpoint or fabric subject', () => {
    const actions = MATTER_AUDIT_DOMAIN.actions.map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'matter.node_quarantined',
        'matter.node_detached',
        'matter.node_reattached',
        'matter.node_claimed',
        'matter.node_relinked',
        'matter.node_repaired',
        'matter.node_archived',
        'matter.node_restored',
        'matter.node_force_removed',
        'matter.node_metadata_updated',
        'matter.endpoint_metadata_updated',
        'matter.fabric_mismatch_detected',
        'matter.fabric_created',
        'matter.recovery_key_generated',
        'matter.recovery_key_acknowledged',
        'matter.recovery_key_rotated',
        'matter.backup_succeeded',
        'matter.backup_failed',
        'matter.restore_validated',
        'matter.restore_refused',
        'matter.restore_confirmed',
        'matter.restore_succeeded',
        'matter.restore_failed',
        'matter.restore_rolled_back',
        'matter.fabric_recovery_required',
        'matter.recovery_action_chosen',
      ]),
    );
    const subjects = new Set(MATTER_AUDIT_DOMAIN.actions.flatMap((entry) => entry.subjectTypes));
    expect(subjects).toEqual(
      new Set([
        'matter.connection',
        'matter.node',
        'matter.endpoint',
        'matter.fabric',
        'matter.backup',
        'matter.recovery_key',
      ]),
    );
  });
});

describe('host-version declarations', () => {
  const combination = COMPATIBILITY_TABLE[0];

  it('derive from the compatibility table in package.json and plugin.json', () => {
    expect(read('package.json').attraccess.host).toBe(combination.attraccess);
    expect(read('plugin.json').attraccessVersion).toEqual({ min: minimumAttraccessVersion(combination) });
  });

  it('use the plugin release listed in the table', () => {
    expect(combination.plugin).toBe('0.4.0-alpha.0');
    expect(read('package.json').version).toBe(combination.plugin);
    expect(read('plugin.json').version).toBe(combination.plugin);
  });
});
