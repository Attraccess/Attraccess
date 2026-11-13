import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { createHash } from 'node:crypto';
import { MatterNode } from '../devices/entities';
import { formatRecoveryKey, generateRecoveryKey } from './recovery-key';
import { ADMIN, createFabricHarness, type FabricHarness } from '../testing/fabric-harness.test-utils';
import { MatterBackup } from './entities';
import { encryptBackup, type BackupBody } from './format';
import { PLUGIN_TABLES, readTables } from './tables';

const entry = COMPATIBILITY_TABLE[0];
type HttpBody = { code?: string; message?: string };
const failure = async (promise: Promise<unknown>): Promise<{ status: number; body: HttpBody }> => {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus?: () => number; getResponse?: () => HttpBody };
    if (e.getStatus && e.getResponse) return { status: e.getStatus(), body: e.getResponse() };
    throw error;
  }
  throw new Error('expected a failure');
};

describe('MatterRestoreService', () => {
  let h: FabricHarness;
  let backupId: string;
  let originalFabricId: string;

  const addNode = (id: string, nodeId: string) =>
    h.dataSource.getRepository(MatterNode).save({
      id,
      fabricRef: 'fabric-ref',
      nodeId,
      lifecycleState: 'unclaimed',
      firstSeenAt: 't',
      lastSeenAt: 't',
      createdAt: 't',
      updatedAt: 't',
    } as MatterNode);
  const nodeIds = async () => (await h.dataSource.getRepository(MatterNode).find()).map((n) => n.nodeId).sort();
  const sidecarFacts = () => JSON.stringify({ fabric: h.backend.fabric(), secret: h.backend.storage?.secret });
  const tables = () => h.dataSource.transaction((manager) => readTables(manager)).then((t) => JSON.stringify(t));

  /** A backup file in the plugin's format around a real snapshot of the fake sidecar, with the given changes. */
  const forge = async (
    change: (body: BackupBody, meta: { pluginVersion: string; pluginMigration: string }) => void = () => undefined,
    key?: Buffer,
  ) => {
    const snapshot = h.backend.handle('backup.snapshot', {}) as BackupBody['sidecar'];
    const body: BackupBody = { sidecar: snapshot, tables: await h.dataSource.transaction((m) => readTables(m)) };
    const meta = { pluginVersion: entry.plugin, pluginMigration: (await h.migrationReader()) as string };
    change(body, meta);
    const usedKey = key ?? ((await h.keys.currentKey())?.key as Buffer);
    return encryptBackup(body, meta, usedKey).toString('base64');
  };
  const upload = (contentBase64: string) => ({ type: 'upload' as const, contentBase64 });
  const stored = () => ({ type: 'stored' as const, backupId });

  beforeEach(async () => {
    h = await createFabricHarness();
    await h.fabric.create(undefined, ADMIN);
    originalFabricId = h.backend.storage?.fabricId as string;
    await addNode('n-1', '5');
    await addNode('n-2', '6');
    backupId = (await h.backups.backup('manual', ADMIN)).id;
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  /** The sidecar lost its fabric and the plugin lost its devices: the situation a restore is for. */
  const disaster = async () => {
    h.backend.clear();
    await h.dataSource.query('DELETE FROM plugin_matter_nodes');
    await h.fabric.detect('connect');
  };

  describe('a successful restore', () => {
    it('brings back the sidecar fabric and the plugin tables, then settles', async () => {
      await disaster();
      expect(h.guard.mismatch).toBe('sidecar_uninitialized');
      h.audit.mockClear();

      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(validation.preflight).toEqual({
        sidecarState: 'uninitialized',
        kind: 'plain',
        currentFabricId: null,
        requiresTypedConfirmation: false,
        confirmationFabricId: null,
      });
      expect(validation.backup).toMatchObject({
        backupId,
        fabricId: originalFabricId,
        fabricGeneration: 1,
        pluginVersion: entry.plugin,
      });
      expect(new Date(validation.expiresAt).getTime()).toBeGreaterThan(Date.now());
      // Validation stages but changes nothing live.
      expect(h.backend.state).toBe('uninitialized');
      expect(await nodeIds()).toEqual([]);

      const result = await h.restore.confirm(validation.validationId, undefined, ADMIN);
      expect(result.outcome).toBe('succeeded');
      expect(await nodeIds()).toEqual(['5', '6']);
      expect(h.backend.state).toBe('initialized');
      expect(h.backend.storage?.fabricId).toBe(originalFabricId);
      // The sidecar's generation is max(staged, live)+1; the plugin recorded exactly that.
      expect(result.status.sidecar.fabricGeneration).toBe(2);
      expect(result.status.recorded).toMatchObject({ fabricId: originalFabricId, fabricGeneration: 2 });
      expect(result.status.recovery).toEqual({ required: false, mismatch: null });
      expect(h.guard.recoveryRequired).toBe(false);
      expect(h.backend.calls).toEqual(
        expect.arrayContaining(['backup.restore.stage', 'backup.restore.commit', 'backup.restore.finalize']),
      );
      // Reconciliation ran, and a new backup was taken after the restore.
      expect(h.connection.requests).toContain('inventory.list');
      expect(result.status.backups.stored[0]).toMatchObject({ trigger: 'restore', fabricGeneration: 2 });
      // No pre-restore backup: there was no healthy fabric to protect.
      expect(result.status.backups.stored.map((b) => b.trigger)).not.toContain('pre_restore');
      expect(h.actions()).toEqual([
        'matter.restore_validated',
        'matter.restore_confirmed',
        'matter.restore_succeeded',
        'matter.backup_succeeded',
      ]);
    });

    it('does not let a reconciliation that starts during the restore touch the tables', async () => {
      await disaster();
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      let overlapping: Promise<unknown> | undefined;
      const handle = h.backend.handle.bind(h.backend);
      jest.spyOn(h.backend, 'handle').mockImplementation((operation, body) => {
        if (operation === 'backup.restore.commit') overlapping = h.reconciliation.request();
        return handle(operation, body);
      });
      await h.restore.confirm(validation.validationId, undefined, ADMIN);
      await overlapping;
      // Only the run the restore asks for afterwards read the inventory: the overlapping one never did.
      expect(h.connection.requests.filter((operation) => operation === 'inventory.list')).toHaveLength(1);
      expect(await nodeIds()).toEqual(['5', '6']);
      expect(h.guard.restoring).toBe(false);
    });

    it('also restores onto a sidecar that needs recovery', async () => {
      h.backend.enterRecovery();
      await h.fabric.detect('connect');
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(validation.preflight).toMatchObject({
        sidecarState: 'recovery_required',
        kind: 'plain',
        requiresTypedConfirmation: false,
      });
      await h.restore.confirm(validation.validationId, undefined, ADMIN);
      expect(h.backend.state).toBe('initialized');
      expect(h.guard.recoveryRequired).toBe(false);
    });

    it('restores an uploaded file with the key typed in, when the installation does not have it', async () => {
      const file = await forge(undefined, generateRecoveryKey());
      await expect(failure(h.restore.validate(upload(file), undefined, ADMIN))).resolves.toMatchObject({
        body: { code: 'key_required' },
      });
      // The key of another installation's backup, typed with arbitrary grouping and case.
      const other = generateRecoveryKey();
      const foreign = await forge(undefined, other);
      const typed = formatRecoveryKey(other).toLowerCase().replace(/-/g, ' ');
      const validation = await h.restore.validate(upload(foreign), typed, ADMIN);
      expect(validation.backup.recoveryKeyId).not.toBe((await h.keys.current())?.keyId);
      await h.restore.cancel(validation.validationId, ADMIN);
    });

    it('uses a retired key by itself for an older backup', async () => {
      await h.fabric.rotateRecoveryKey(ADMIN);
      const old = (await h.dataSource.getRepository(MatterBackup).findOneByOrFail({ id: backupId })).recoveryKeyId;
      expect(old).not.toBe((await h.keys.current())?.keyId);
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(validation.backup.recoveryKeyId).toBe(old);
    });
  });

  describe('overwriting a healthy fabric', () => {
    it('needs the typed fabric ID, and nothing happens without it', async () => {
      await addNode('n-3', '7');
      const before = { nodes: await tables(), sidecar: sidecarFacts() };
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(validation.preflight).toEqual({
        sidecarState: 'initialized',
        kind: 'rollback',
        currentFabricId: originalFabricId,
        requiresTypedConfirmation: true,
        confirmationFabricId: originalFabricId,
      });
      for (const typed of [undefined, '', '1', ` ${originalFabricId}9`]) {
        const refused = await failure(h.restore.confirm(validation.validationId, typed, ADMIN));
        expect(refused).toMatchObject({ status: 409, body: { code: 'confirmation_required' } });
      }
      expect(h.backend.calls).not.toContain('backup.restore.commit');
      expect(await tables()).toBe(before.nodes);
      expect(sidecarFacts()).toBe(before.sidecar);
      expect(h.actions().filter((a) => a === 'matter.restore_refused')).toHaveLength(4);

      // The validation is still usable with the right ID (whitespace around it is forgiven).
      const result = await h.restore.confirm(validation.validationId, ` ${originalFabricId} `, ADMIN);
      expect(result.outcome).toBe('succeeded');
      expect(await nodeIds()).toEqual(['5', '6']);
    });

    it('takes an automatic pre-restore backup first, containing the state that is being replaced', async () => {
      await addNode('n-3', '7');
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      await h.restore.confirm(validation.validationId, originalFabricId, ADMIN);
      const triggers = (await h.backups.list()).map((b) => b.trigger);
      expect(triggers).toEqual(['restore', 'pre_restore', 'manual', 'fabric_created']);
      expect(h.actions()).toEqual(
        expect.arrayContaining(['matter.backup_succeeded', 'matter.restore_confirmed', 'matter.restore_succeeded']),
      );
      const order = h.backend.calls.filter((call) => /snapshot|stage|commit|finalize/.test(call));
      expect(order.indexOf('backup.snapshot')).toBeLessThan(order.indexOf('backup.restore.commit'));
    });

    it('classifies a different fabric as a replacement', async () => {
      h.backend.seedFabric('999', 3);
      await h.fabric.detect('connect');
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(validation.preflight).toMatchObject({
        kind: 'replacement',
        currentFabricId: '999',
        confirmationFabricId: '999',
      });
      // The plugin is in recovery, so no consistent backup of the current state can be made: it goes ahead without one.
      await expect(h.restore.confirm(validation.validationId, '999', ADMIN)).resolves.toMatchObject({
        outcome: 'succeeded',
      });
      expect(h.backend.storage?.fabricId).toBe(originalFabricId);
      expect((await h.backups.list()).map((b) => b.trigger)).not.toContain('pre_restore');
    });

    it('does not restore when the pre-restore backup cannot be made', async () => {
      const before = { tables: await tables(), sidecar: sidecarFacts() };
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      h.backend.faults.snapshotFails = true;
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        status: 409,
        body: { code: 'pre_restore_backup_failed', message: expect.stringContaining('unchanged') },
      });
      expect(h.backend.calls).not.toContain('backup.restore.commit');
      expect(h.backend.calls).toContain('backup.restore.abort');
      expect(await tables()).toBe(before.tables);
      expect(sidecarFacts()).toBe(before.sidecar);
    });
  });

  describe('validation fails before anything is changed', () => {
    const expectRefused = async (promise: Promise<unknown>, code: string) => {
      const before = {
        tables: await tables(),
        sidecar: sidecarFacts(),
        stages: h.backend.calls.filter((c) => c === 'backup.restore.stage').length,
      };
      expect(await failure(promise)).toMatchObject({ status: 422, body: { code, message: expect.any(String) } });
      expect(await tables()).toBe(before.tables);
      expect(sidecarFacts()).toBe(before.sidecar);
      expect(h.backend.calls).not.toContain('backup.restore.commit');
      return before;
    };

    it('refuses a wrong key, before staging anything', async () => {
      const before = await expectRefused(
        h.restore.validate(stored(), formatRecoveryKey(generateRecoveryKey()), ADMIN),
        'wrong_key',
      );
      expect(h.backend.calls.filter((c) => c === 'backup.restore.stage')).toHaveLength(before.stages);
      await expectRefused(h.restore.validate(stored(), 'not a key', ADMIN), 'wrong_key');
    });

    it('refuses a key it does not have and was not given', async () => {
      await expectRefused(
        h.restore.validate(upload(await forge(undefined, generateRecoveryKey())), undefined, ADMIN),
        'key_required',
      );
    });

    it('refuses damage anywhere in the file', async () => {
      const file = Buffer.from(await forge(), 'base64');
      const flipAt = (index: number) => {
        const copy = Buffer.from(file);
        copy[index] ^= 1;
        return copy.toString('base64');
      };
      const bodyStart = 12 + file.readUInt32BE(8);
      await expectRefused(h.restore.validate(upload(flipAt(file.length - 40)), undefined, ADMIN), 'corrupt');
      await expectRefused(h.restore.validate(upload(flipAt(bodyStart + 3)), undefined, ADMIN), 'corrupt');
      await expectRefused(
        h.restore.validate(upload(file.subarray(0, file.length - 9).toString('base64')), undefined, ADMIN),
        'truncated',
      );
      await expectRefused(
        h.restore.validate(
          upload(Buffer.from('nonsense that is long enough to be read').toString('base64')),
          undefined,
          ADMIN,
        ),
        'incompatible_format',
      );
      await expectRefused(h.restore.validate(upload(flipAt(0)), undefined, ADMIN), 'incompatible_format');
      // The header carries the key ID: a bit flip there reads as another key.
      const bad = await h.restore.validate(upload(flipAt(bodyStart - 40)), undefined, ADMIN).catch((e) => e);
      expect(bad.getStatus()).toBe(422);
    });

    it('refuses an incompatible storage schema, plugin migration or release', async () => {
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((b) => {
              b.sidecar.header.storageSchemaVersion = 2;
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_schema',
      );
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((_b, m) => {
              m.pluginMigration = 'SomethingElse1999999999999';
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_migration',
      );
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((_b, m) => {
              m.pluginVersion = '0.0.1';
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_version',
      );
    });

    it('refuses tables that do not fit this installation', async () => {
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((b) => {
              b.tables['plugin_matter_connection'] = [{ id: 1 }];
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_schema',
      );
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((b) => {
              b.tables['plugin_matter_nodes'][0]['no_such_column'] = 1;
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_schema',
      );
      await expectRefused(
        h.restore.validate(
          upload(
            await forge((b) => {
              b.tables['plugin_matter_nodes'][0]['display_name'] = { x: 1 };
            }),
          ),
          undefined,
          ADMIN,
        ),
        'incompatible_schema',
      );
    });

    it('refuses when the sidecar rejects the snapshot', async () => {
      h.backend.faults.stageRejects = true;
      await expectRefused(h.restore.validate(stored(), undefined, ADMIN), 'stage_failed');
    });

    it('refuses over plain HTTP to another machine, and without a connection', async () => {
      h.connection.insecureTransport = true;
      await expectRefused(h.restore.validate(stored(), undefined, ADMIN), 'insecure_transport');
      h.connection.insecureTransport = false;
      h.connection.setState('degraded');
      await expectRefused(h.restore.validate(stored(), undefined, ADMIN), 'sidecar_unavailable');
    });

    it('answers 404 for a backup that does not exist', async () => {
      expect(
        await failure(
          h.restore.validate({ type: 'stored', backupId: '00000000-0000-4000-8000-000000000000' }, undefined, ADMIN),
        ),
      ).toMatchObject({ status: 404 });
    });

    it('audits every refusal with a code and nothing else', async () => {
      await failure(h.restore.validate(stored(), 'garbage', ADMIN));
      expect(h.actions()).toEqual(['matter.restore_refused']);
      expect((h.audit.mock.calls[0] as unknown as [{ outcome: string; details: object }])[0]).toMatchObject({
        outcome: 'failed',
        details: { reason: 'wrong_key', backupRef: expect.any(String) },
      });
    });
  });

  describe('the sidecar cannot commit', () => {
    it('leaves the plugin tables and the sidecar untouched when it swaps back itself', async () => {
      await disaster();
      await addNode('n-9', '9');
      const before = { tables: await tables(), sidecar: sidecarFacts() };
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      h.backend.faults.commitRestoreFailed = true;
      expect(await failure(h.restore.confirm(validation.validationId, undefined, ADMIN))).toMatchObject({
        status: 409,
        body: { code: 'restore_failed', message: expect.stringContaining('unchanged') },
      });
      expect(await tables()).toBe(before.tables);
      expect(sidecarFacts()).toBe(before.sidecar);
      expect(h.backend.calls).toContain('backup.restore.abort');
      expect(h.actions()).toContain('matter.restore_failed');
      expect(h.guard.busy).toBe(false);
    });

    it('rolls the sidecar back when the answer to the commit never arrives', async () => {
      await disaster();
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      h.backend.faults.commitTimeoutAfterSwap = true;
      expect(await failure(h.restore.confirm(validation.validationId, undefined, ADMIN))).toMatchObject({
        body: { code: 'restore_failed' },
      });
      expect(h.backend.calls).toContain('backup.restore.rollback');
      expect(h.backend.state).toBe('uninitialized');
      expect(await nodeIds()).toEqual([]);
    });

    it('an unknown stage is simply refused', async () => {
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(
        await failure(h.restore.confirm('00000000-0000-4000-8000-000000000000', originalFabricId, ADMIN)),
      ).toMatchObject({
        body: { code: 'validation_expired' },
      });
      await h.restore.cancel(validation.validationId, ADMIN);
    });
  });

  describe('the database step fails', () => {
    // A backup that the sidecar accepts but whose plugin tables cannot be written: a lifecycle value the schema forbids.
    const poisoned = async () =>
      forge((b) => {
        b.tables['plugin_matter_nodes'][0]['lifecycle_state'] = 'bogus';
      });

    it('rolls the sidecar back and leaves the installation exactly as it was', async () => {
      const before = { tables: await tables(), sidecar: sidecarFacts() };
      const validation = await h.restore.validate(upload(await poisoned()), undefined, ADMIN);
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        status: 409,
        body: { code: 'rolled_back', message: expect.stringContaining('unchanged') },
      });
      expect(h.backend.calls).toEqual(expect.arrayContaining(['backup.restore.commit', 'backup.restore.rollback']));
      expect(h.backend.calls).not.toContain('backup.restore.finalize');
      // Same tables (the fabric record only follows the sidecar's generation), same fabric and keys in the sidecar.
      const withoutFabrics = (json: string) => {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        delete parsed['plugin_matter_fabrics'];
        return parsed;
      };
      expect(withoutFabrics(await tables())).toEqual(withoutFabrics(before.tables));
      expect(JSON.parse(sidecarFacts()).secret).toBe(JSON.parse(before.sidecar).secret);
      expect(h.backend.storage?.fabricId).toBe(originalFabricId);
      expect(h.actions()).toEqual(expect.arrayContaining(['matter.restore_rolled_back']));
      // The rollback moved the sidecar's generation on; the plugin recorded its own operation, so no recovery.
      expect(h.guard.recoveryRequired).toBe(false);
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(h.backend.fabric().fabricGeneration);
      expect(h.guard.busy).toBe(false);
    });

    it('reports it when even the rollback fails', async () => {
      const validation = await h.restore.validate(upload(await poisoned()), undefined, ADMIN);
      h.backend.faults.rollbackFails = true;
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        status: 500,
        body: { code: 'rollback_failed' },
      });
      expect(h.actions()).toContain('matter.restore_failed');
    });
  });

  describe('the validation', () => {
    it('is single: a new validation aborts the staged data of the previous one', async () => {
      const first = await h.restore.validate(stored(), undefined, ADMIN);
      const second = await h.restore.validate(stored(), undefined, ADMIN);
      expect(h.backend.calls.filter((c) => c === 'backup.restore.abort')).toHaveLength(1);
      expect(await failure(h.restore.confirm(first.validationId, originalFabricId, ADMIN))).toMatchObject({
        body: { code: 'validation_expired' },
      });
      await expect(h.restore.confirm(second.validationId, originalFabricId, ADMIN)).resolves.toMatchObject({
        outcome: 'succeeded',
      });
    });

    it('can be cancelled, which aborts the staging, and only by its own administrator', async () => {
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      await h.restore.cancel(validation.validationId, { ...ADMIN, userId: 99 });
      expect(h.backend.calls).not.toContain('backup.restore.abort');
      await h.restore.cancel(validation.validationId, ADMIN);
      expect(h.backend.calls).toContain('backup.restore.abort');
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        body: { code: 'validation_expired' },
      });
    });

    it('belongs to the administrator who made it', async () => {
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      expect(
        await failure(h.restore.confirm(validation.validationId, originalFabricId, { ...ADMIN, userId: 99 })),
      ).toMatchObject({ body: { code: 'validation_expired' } });
    });

    it('expires, which aborts the staging', async () => {
      const short = await createFabricHarness({ validationTtlMs: 20 });
      await short.fabric.create(undefined, ADMIN);
      const id = (await short.backups.backup('manual', ADMIN)).id;
      const validation = await short.restore.validate({ type: 'stored', backupId: id }, undefined, ADMIN);
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(short.backend.calls).toContain('backup.restore.abort');
      expect(
        await failure(short.restore.confirm(validation.validationId, short.backend.storage?.fabricId, ADMIN)),
      ).toMatchObject({ body: { code: 'validation_expired' } });
      await short.close();
    });

    it('is invalidated when the sidecar changed in between', async () => {
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      h.backend.clear();
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        body: { code: 'preflight_changed' },
      });
      expect(h.backend.calls).not.toContain('backup.restore.commit');
      expect(h.backend.calls).toContain('backup.restore.abort');
    });

    it('refuses a second restore while one runs', async () => {
      const validation = await h.restore.validate(stored(), undefined, ADMIN);
      const running = h.restore.confirm(validation.validationId, originalFabricId, ADMIN);
      expect(await failure(h.restore.confirm(validation.validationId, originalFabricId, ADMIN))).toMatchObject({
        status: 409,
      });
      await running;
    });
  });

  it('keeps the connection settings and the backups themselves out of what a restore replaces', async () => {
    expect(PLUGIN_TABLES.map(([name]) => name)).not.toEqual(expect.arrayContaining(['plugin_matter_connection']));
    await disaster();
    const connectionBefore = JSON.stringify(await h.rows('plugin_matter_connection'));
    const validation = await h.restore.validate(stored(), undefined, ADMIN);
    await h.restore.confirm(validation.validationId, undefined, ADMIN);
    expect(JSON.stringify(await h.rows('plugin_matter_connection'))).toBe(connectionBefore);
    expect((await h.backups.list()).some((b) => b.id === backupId)).toBe(true);
    expect(createHash('sha256').update('x').digest('hex')).toHaveLength(64);
  });
});
