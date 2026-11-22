import { COMPATIBILITY_TABLE, minimumAttraccessVersion } from '@attraccess/matter-contract';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import plugin from './plugin';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterBackupController } from './backup/controller';
import { MatterFabricController } from './fabric/controller';
import { MatterRestoreService } from './backup/restore.service';
import { MatterChangeBus } from './devices/change-bus';
import { MatterCommissioningController } from './commissioning/controller';
import { MatterDevicesController } from './devices/controller';
import { MatterLifecycleService } from './devices/lifecycle.service';
import { MatterLiveUpdatesService } from './devices/live-updates.service';
import { MatterReconciliationService } from './devices/reconciliation.service';
import { MatterStateService } from './devices/state.service';
import { MATTER_STORAGE } from './plugin-storage/tables';
import { createHarness } from './testing/devices-harness.test-utils';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', name), 'utf8'));

describe('matter plugin backend', () => {
  it('registers the controllers, the services, the storage definition and the audit domain', () => {
    const module = plugin.register({} as never);
    expect(module.controllers).toEqual([
      MatterConnectionController,
      MatterDevicesController,
      MatterCommissioningController,
      MatterFabricController,
      MatterBackupController,
    ]);
    expect(module.providers).toHaveLength(21);
    expect(plugin.storage).toBe(MATTER_STORAGE);
    expect(plugin.auditDomains).toEqual([MATTER_AUDIT_DOMAIN]);
  });

  it('wires one change bus into every service that announces changes and into the live topics', async () => {
    const { context } = await createHarness();
    // Compiling builds the providers without running their lifecycle hooks: no sidecar, no timers.
    const moduleRef = await Test.createTestingModule({ imports: [plugin.register(context)] }).compile();
    const bus = moduleRef.get(MatterChangeBus);
    const busOf = (service: object, field: string) => (service as Record<string, unknown>)[field];
    expect(busOf(moduleRef.get(MatterLifecycleService), 'changes')).toBe(bus);
    expect(busOf(moduleRef.get(MatterStateService), 'changes')).toBe(bus);
    expect(busOf(moduleRef.get(MatterReconciliationService), 'changes')).toBe(bus);
    expect(busOf(moduleRef.get(MatterRestoreService), 'changes')).toBe(bus);
    expect(busOf(moduleRef.get(MatterLiveUpdatesService), 'bus')).toBe(bus);
  });

  it('declares exactly the permissions it uses, no legacy persistence entry and a frontend entry', () => {
    const pkg = read('package.json');
    const manifest = read('plugin.json');
    expect(pkg.attraccess.permissions).toEqual(['PLUGIN_STORAGE', 'MANAGE_SECRETS']);
    expect(manifest.permissions).toEqual(['PLUGIN_STORAGE', 'MANAGE_SECRETS']);
    // The host owns the tables and their migrations: no engine list, no TypeORM migrations bundle.
    expect(pkg.attraccess).not.toHaveProperty('persistence');
    expect(pkg.attraccess).not.toHaveProperty('migrations');
    expect(manifest).not.toHaveProperty('persistence');
    expect(manifest.main).not.toHaveProperty('migrations');
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
      (field.type === 'string' && /^\[(0-9a-f-|0-9|A-Za-z0-9_,)\]/.test(field.pattern ?? ''));
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
        'matter.commissioning_started',
        'matter.commissioning_failed',
        'matter.commissioning_interrupted',
        'matter.commissioning_cancelled',
        'matter.commissioning_attestation_overridden',
        'matter.node_commissioned',
        'matter.commissioning_finished',
        'matter.node_removed_from_fabric',
        'matter.node_force_removed_from_fabric',
        'matter.node_removal_failed',
        'matter.node_shared',
        'matter.node_share_revoked',
        'matter.node_share_expired',
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
        'matter.commissioning_session',
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
    expect(combination.plugin).toBe('0.5.0-alpha.0');
    expect(read('package.json').version).toBe(combination.plugin);
    expect(read('plugin.json').version).toBe(combination.plugin);
  });
});
