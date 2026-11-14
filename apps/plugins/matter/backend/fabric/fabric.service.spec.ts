import { ConflictException } from '@nestjs/common';
import { MatterRecoveryKey } from '../backup/entities';
import { MatterFabric, MatterNode } from '../devices/entities';
import { ADMIN, createFabricHarness, type FabricHarness } from '../testing/fabric-harness.test-utils';
import { parseRecoveryKey, recoveryKeyId } from '../backup/recovery-key';
import { SidecarUnavailableError } from '../client/errors';
import { auditSubjectId } from '../devices/audit.service';

type AuditCall = { action: string; subject: { type: string; id: number }; details: Record<string, unknown> };
const callsOf = (h: FabricHarness, action: string) =>
  h.audit.mock.calls.map((call) => (call as unknown as [AuditCall])[0]).filter((entry) => entry.action === action);

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse?: () => { code?: string } }).getResponse?.().code ?? `unexpected:${String(error)}`;
  }
  return 'no error';
};

describe('MatterFabricService', () => {
  let h: FabricHarness;
  beforeEach(async () => {
    h = await createFabricHarness();
  });
  afterEach(() => h.close());

  describe('create', () => {
    it('creates the fabric, records its identity, reveals a recovery key once and takes the first backup', async () => {
      const { status, recoveryKey } = await h.fabric.create('Home', ADMIN);

      expect(h.backend.state).toBe('initialized');
      expect(recoveryKey).toMatchObject({
        keyId: expect.stringMatching(/^[0-9a-f]{16}$/),
        createdAt: expect.any(String),
      });
      expect(recoveryKeyId(parseRecoveryKey(recoveryKey?.key ?? ''))).toBe(recoveryKey?.keyId);
      expect(status.sidecar).toMatchObject({ reachable: true, state: 'initialized', fabricGeneration: 1 });
      expect(status.recorded).toEqual({
        fabricId: h.backend.storage?.fabricId,
        rootCertFingerprint: h.backend.storage?.rootCertFingerprint,
        storageInstanceId: h.backend.storage?.storageInstanceId,
        fabricGeneration: 1,
      });
      expect(status.recoveryKey).toEqual({
        present: true,
        keyId: recoveryKey?.keyId,
        createdAt: recoveryKey?.createdAt,
        acknowledged: false,
      });
      expect(status.recovery).toEqual({ required: false, mismatch: null });
      expect(status.backups.stored).toHaveLength(1);
      expect(status.backups.stored[0]).toMatchObject({ trigger: 'fabric_created', actor: '7', fabricGeneration: 1 });
      expect(status.backups.lastAttempt).toMatchObject({ outcome: 'succeeded', trigger: 'fabric_created' });
      expect(status.actions).toMatchObject({ canCreateFabric: false, canBackup: true, canRestore: true });
      expect(h.actions()).toEqual(
        expect.arrayContaining(['matter.recovery_key_generated', 'matter.fabric_created', 'matter.backup_succeeded']),
      );
      // The sidecar's label is passed on.
      expect(h.connection.bodies['fabric.create']).toEqual({ label: 'Home' });
    });

    it('stores the key only encrypted and never returns it again', async () => {
      const { recoveryKey } = await h.fabric.create(undefined, ADMIN);
      const [row] = await h.dataSource.getRepository(MatterRecoveryKey).find();
      const key = recoveryKey?.key ?? '';
      const raw = parseRecoveryKey(key);
      expect(row.encryptedKey).toMatch(/^enc:/);
      for (const form of [key, key.replace(/-/g, ''), raw.toString('base64'), raw.toString('hex')]) {
        expect(row.encryptedKey).not.toContain(form);
        expect(JSON.stringify(await h.rows('plugin_matter_recovery_keys'))).not.toContain(form);
      }
      expect(h.context.secrets.decrypt(row.encryptedKey)).toBe(raw.toString('base64'));
      // Neither the status nor a second create nor any list returns it.
      expect(JSON.stringify(await h.fabric.status())).not.toContain(key);
      expect(await codeOf(h.keys.generate(ADMIN))).toBe('recovery_key_exists');
    });

    it('uses the default label, refuses a second fabric and an unconnected sidecar', async () => {
      await h.fabric.create(undefined, ADMIN);
      expect(h.connection.bodies['fabric.create']).toEqual({ label: 'Attraccess' });
      expect(await codeOf(h.fabric.create(undefined, ADMIN))).toBe('fabric_exists');

      const other = await createFabricHarness();
      other.connection.setState('degraded');
      expect(await codeOf(other.fabric.create(undefined, ADMIN))).toBe('sidecar_unavailable');
      await other.close();
    });

    it('does not generate a second key when one exists', async () => {
      await h.keys.generate(ADMIN);
      const { recoveryKey } = await h.fabric.create(undefined, ADMIN);
      expect(recoveryKey).toBeNull();
      expect(await h.dataSource.getRepository(MatterRecoveryKey).count()).toBe(1);
    });

    it('refuses to create while the fabric needs recovery', async () => {
      h.backend.enterRecovery();
      await h.fabric.detect('connect');
      expect(h.guard.mismatch).toBe('sidecar_recovery_required');
      expect(await codeOf(h.fabric.create(undefined, ADMIN))).toBe('recovery_required');
      expect(h.backend.calls).not.toContain('fabric.create');
    });

    it('still succeeds when the first backup cannot be made, and records the failed attempt', async () => {
      h.connection.insecureTransport = true;
      const { status } = await h.fabric.create(undefined, ADMIN);
      expect(status.backups.stored).toEqual([]);
      expect(status.backups.lastAttempt).toMatchObject({
        outcome: 'failed',
        trigger: 'fabric_created',
        reason: 'insecure_transport',
      });
      expect(status.actions.canBackup).toBe(false);
    });
  });

  describe('recovery key', () => {
    it('acknowledges the current key only, and rotates with an audit entry and a new backup', async () => {
      const { recoveryKey } = await h.fabric.create(undefined, ADMIN);
      expect(await codeOf(h.keys.acknowledge('0'.repeat(16), ADMIN))).toBe('recovery_key_mismatch');
      await h.keys.acknowledge(recoveryKey?.keyId ?? '', ADMIN);
      expect((await h.fabric.status()).recoveryKey.acknowledged).toBe(true);

      const rotated = await h.fabric.rotateRecoveryKey(ADMIN);
      expect(rotated.keyId).not.toBe(recoveryKey?.keyId);
      const status = await h.fabric.status();
      expect(status.recoveryKey).toMatchObject({ keyId: rotated.keyId, acknowledged: false });
      expect(status.backups.stored[0]).toMatchObject({ recoveryKeyId: rotated.keyId, trigger: 'manual' });
      expect(h.actions()).toEqual(
        expect.arrayContaining(['matter.recovery_key_acknowledged', 'matter.recovery_key_rotated']),
      );
      // The old key is retired but kept, so older backups stay readable.
      expect(await h.keys.keyById(recoveryKey?.keyId ?? '')).not.toBeNull();
      expect(await h.dataSource.getRepository(MatterRecoveryKey).count()).toBe(2);
    });

    it('rotating during a running backup takes a new backup under the new key instead of joining the old one', async () => {
      await h.fabric.create(undefined, ADMIN);
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      const request = h.connection.request.bind(h.connection);
      let snapshots = 0;
      let reached: () => void = () => undefined;
      const snapshotReached = new Promise<void>((resolve) => (reached = resolve));
      jest.spyOn(h.connection, 'request').mockImplementation(async (operation, options) => {
        if (operation === 'backup.snapshot' && snapshots++ === 0) {
          reached();
          await held;
        }
        return request(operation, options);
      });
      const running = h.backups.backup('manual', ADMIN);
      // Rotate only once the first backup is really held inside the sidecar snapshot, not after a guessed delay.
      await snapshotReached;
      const oldKeyId = (await h.keys.current())?.keyId;
      const rotating = h.fabric.rotateRecoveryKey(ADMIN);
      await new Promise((resolve) => setImmediate(resolve));
      release();
      expect((await running).recoveryKeyId).toBe(oldKeyId);
      const rotated = await rotating;
      expect(snapshots).toBe(2);
      expect((await h.backups.list())[0]).toMatchObject({ trigger: 'manual', recoveryKeyId: rotated.keyId });
    });

    it('cannot rotate without a key', async () => {
      expect(await codeOf(h.keys.rotate(ADMIN))).toBe('no_recovery_key');
    });

    it('generates a key for a fabric that exists without one', async () => {
      h.backend.seedFabric('77', 4);
      await h.fabric.detect('connect');
      expect((await h.fabric.status()).actions.canBackup).toBe(false);
      const reveal = await h.fabric.generateRecoveryKey(ADMIN);
      expect(reveal.key).toMatch(/^[A-Z2-7-]+$/);
      expect((await h.fabric.status()).backups.stored).toHaveLength(1);
    });
  });

  describe('mismatch detection on connect and fabric.changed', () => {
    const rowOf = (id: string) => h.dataSource.getRepository(MatterFabric).findOneByOrFail({ fabricId: id });

    beforeEach(async () => {
      await h.fabric.create(undefined, ADMIN);
      h.audit.mockClear();
    });

    it('stays quiet while everything matches', async () => {
      expect(await h.fabric.detect('connect')).toBeNull();
      expect(h.guard.recoveryRequired).toBe(false);
      expect(h.actions()).toEqual([]);
    });

    it.each([
      ['an uninitialized sidecar', () => h.backend.clear(), 'sidecar_uninitialized'],
      ['a sidecar in recovery', () => h.backend.enterRecovery(), 'sidecar_recovery_required'],
      [
        'a different fabric',
        () => {
          h.backend.seedFabric('999', 5);
        },
        'fabric_changed',
      ],
      [
        'a replaced storage',
        () => {
          if (h.backend.storage) h.backend.storage.storageInstanceId = '00000000-0000-4000-8000-0000000000ff';
        },
        'storage_instance_changed',
      ],
      [
        'an older generation',
        () => {
          h.backend.generationCounter = 0;
        },
        'generation_behind',
      ],
      [
        'a newer generation after downtime',
        () => {
          h.backend.generationCounter = 9;
        },
        'generation_ahead',
      ],
    ] as const)('flags %s and audits it once', async (_name, change, expected) => {
      change();
      expect(await h.fabric.detect('connect')).toBe(expected);
      expect(await h.fabric.detect('connect')).toBe(expected);
      const status = await h.fabric.status();
      expect(status.recovery).toEqual({ required: true, mismatch: expected });
      expect(h.actions()).toEqual(['matter.fabric_recovery_required']);
      // The #2173 convention: the recorded row's UUID is the subject, and travels in full as `fabricRef`.
      const [recorded] = await h.dataSource.getRepository(MatterFabric).find();
      expect(callsOf(h, 'matter.fabric_recovery_required')[0]).toMatchObject({
        subject: { type: 'matter.fabric', id: auditSubjectId(recorded.id) },
        details: { fabricRef: recorded.id, mismatch: expected },
      });
    });

    it('audits a mismatch without a recorded fabric on the fixed "no fabric" subject, without a fabricRef', async () => {
      await h.dataSource.query('DELETE FROM plugin_matter_fabrics');
      h.backend.enterRecovery();
      expect(await h.fabric.detect('connect')).toBe('sidecar_recovery_required');
      expect(callsOf(h, 'matter.fabric_recovery_required')[0]).toMatchObject({
        subject: { type: 'matter.fabric', id: 1 },
        details: { mismatch: 'sidecar_recovery_required' },
      });
      expect(callsOf(h, 'matter.fabric_recovery_required')[0].details).not.toHaveProperty('fabricRef');
    });

    it('clears the state again when the sidecar matches once more', async () => {
      const original = { ...h.backend.storage } as NonNullable<typeof h.backend.storage>;
      h.backend.generationCounter = 0;
      await h.fabric.detect('connect');
      expect(h.guard.recoveryRequired).toBe(true);
      h.backend.generationCounter = original.generation;
      expect(await h.fabric.detect('connect')).toBeNull();
      expect(h.guard.recoveryRequired).toBe(false);
    });

    it('never creates, restores or overwrites anything by itself', async () => {
      h.backend.clear();
      const before = h.backend.calls.length;
      await h.fabric.detect('connect');
      await h.fabric.detect('event');
      expect(h.backend.calls.slice(before).filter((call) => call !== 'fabric.get')).toEqual([]);
      expect(h.backend.state).toBe('uninitialized');
    });

    it('records a generation advance that arrives as a fabric.changed event, and tells the schedule', async () => {
      const advanced = jest.fn();
      h.fabric.onAdvanced(advanced);
      h.backend.generationCounter = 2;
      expect(await h.fabric.detect('event')).toBeNull();
      expect(advanced).toHaveBeenCalledWith(expect.objectContaining({ fabricGeneration: 2 }));
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(2);
      expect(h.guard.recoveryRequired).toBe(false);
    });

    it('does not take a generation advance on trust once recovery is required', async () => {
      h.backend.generationCounter = 0;
      await h.fabric.detect('connect');
      h.backend.generationCounter = 8;
      expect(await h.fabric.detect('event')).toBe('generation_ahead');
      expect(h.guard.recoveryRequired).toBe(true);
    });

    it('adopts the sidecar fabric when the plugin has recorded nothing', async () => {
      await h.dataSource.query('UPDATE plugin_matter_fabrics SET fabric_generation = NULL');
      expect(await h.fabric.detect('connect')).toBeNull();
      expect((await h.fabric.status()).recorded?.fabricId).toBe(h.backend.storage?.fabricId);
      expect(await rowOf(h.backend.storage?.fabricId ?? '')).toMatchObject({ fabricGeneration: 1 });
    });

    it('leaves the state as it was when the sidecar cannot be asked', async () => {
      h.backend.generationCounter = 0;
      await h.fabric.detect('connect');
      h.connection.setState('degraded');
      expect(await h.fabric.detect('connect')).toBe('generation_behind');
      expect(h.guard.recoveryRequired).toBe(true);
    });

    it('detects on its own when the connection comes up and when a fabric.changed event arrives', async () => {
      h.fabric.onModuleInit();
      h.backend.generationCounter = 0;
      h.connection.setState('connecting');
      h.connection.setState('connected');
      await h.fabric.detect('connect');
      expect(h.guard.mismatch).toBe('generation_behind');
      h.backend.generationCounter = 1;
      h.connection.emitEvent('fabric.changed', {});
      await h.fabric.detect('event');
      expect(h.guard.mismatch).toBeNull();
      h.fabric.onModuleDestroy();
    });

    it('judges a generation advance like a reconnect while a restore of unknown outcome may still land', async () => {
      h.guard.outcomeUnknown = true;
      h.backend.generationCounter = 2;
      expect(await h.fabric.detect('event')).toBe('generation_ahead');
      expect(h.guard.recoveryRequired).toBe(true);
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(1);
    });

    it('ends an unknown restore outcome once a connect check finds the sidecar agreeing', async () => {
      h.guard.outcomeUnknown = true;
      // Neither an event nor the check right after the restore itself settles it: that restore may still land.
      expect(await h.fabric.detect('event')).toBeNull();
      expect(await h.fabric.detect('connect', { keepOutcomeUnknown: true })).toBeNull();
      expect(h.guard.outcomeUnknown).toBe(true);
      expect(await h.fabric.detect('connect')).toBeNull();
      expect(h.guard.outcomeUnknown).toBe(false);
      h.backend.generationCounter = 2;
      expect(await h.fabric.detect('event')).toBeNull();
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(2);
    });

    it('keeps an unknown restore outcome when the restore did land: that connect check is a mismatch', async () => {
      h.guard.outcomeUnknown = true;
      h.backend.generationCounter = 2;
      expect(await h.fabric.detect('connect')).toBe('generation_ahead');
      expect(h.guard.outcomeUnknown).toBe(true);
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(1);
    });

    it('trusts events again once the plugin recorded a fabric itself', async () => {
      h.guard.outcomeUnknown = true;
      h.backend.seedFabric('4242', 3);
      await h.fabric.detect('connect');
      await h.fabric.acceptSidecar(ADMIN);
      expect(h.guard.outcomeUnknown).toBe(false);
      h.backend.generationCounter = 4;
      expect(await h.fabric.detect('event')).toBeNull();
      expect((await h.fabric.status()).recorded?.fabricGeneration).toBe(4);
    });

    it('does not judge the sidecar while the plugin itself is changing the fabric', async () => {
      h.guard.busy = true;
      h.backend.clear();
      expect(await h.fabric.detect('event')).toBeNull();
      expect(h.guard.recoveryRequired).toBe(false);
      h.guard.busy = false;
    });
  });

  describe('recovery.required blocks fabric changes', () => {
    beforeEach(async () => {
      await h.fabric.create(undefined, ADMIN);
      h.backend.generationCounter = 0;
      await h.fabric.detect('connect');
    });

    it('the guard throws a 409 recovery_required', () => {
      expect(() => h.fabric.assertFabricMutationAllowed()).toThrow(ConflictException);
      try {
        h.fabric.assertFabricMutationAllowed();
      } catch (error) {
        expect((error as ConflictException).getResponse()).toMatchObject({ code: 'recovery_required' });
      }
    });

    it('offers only the recovery actions that fit the sidecar', async () => {
      expect((await h.fabric.status()).actions).toMatchObject({
        canCreateFabric: false,
        canBackup: false,
        canAcceptSidecar: true,
        canStartNew: false,
      });
      h.backend.clear();
      await h.fabric.detect('connect');
      expect((await h.fabric.status()).actions).toMatchObject({
        canAcceptSidecar: false,
        canStartNew: true,
        canCreateFabric: false,
      });
    });
  });

  describe('recovery actions', () => {
    beforeEach(async () => {
      await h.fabric.create(undefined, ADMIN);
      h.audit.mockClear();
    });

    it('accept-sidecar records the sidecar facts, runs the reconciliation and takes a backup', async () => {
      const original = h.backend.storage?.fabricId;
      h.backend.seedFabric('4242', 7);
      await h.fabric.detect('connect');
      expect(h.guard.mismatch).toBe('fabric_changed');
      const before = h.backend.calls.length;
      const status = await h.fabric.acceptSidecar(ADMIN);

      expect(status.recovery).toEqual({ required: false, mismatch: null });
      expect(status.recorded).toMatchObject({ fabricId: '4242', fabricGeneration: 7 });
      expect(h.connection.requests).toContain('inventory.list');
      expect(h.backend.calls.slice(before)).toContain('backup.snapshot');
      expect(status.backups.stored[0]).toMatchObject({ fabricId: '4242', trigger: 'fabric_changed' });
      expect(h.actions()).toEqual(expect.arrayContaining(['matter.recovery_action_chosen', 'matter.backup_succeeded']));
      // Audited on the row of the fabric the plugin had recorded when the administrator chose.
      const old = await h.dataSource.getRepository(MatterFabric).findOneByOrFail({ fabricId: original });
      expect(callsOf(h, 'matter.recovery_action_chosen')).toEqual([
        expect.objectContaining({
          subject: { type: 'matter.fabric', id: auditSubjectId(old.id) },
          details: { fabricRef: old.id, choice: 'accept_sidecar' },
        }),
      ]);
      const detached = await h.rows<{ status: string; fabric_id: string }>('plugin_matter_fabrics');
      expect(detached.find((row) => row.fabric_id !== '4242')?.status).toBe('absent');
    });

    it('accept-sidecar is only valid in recovery, and only for a healthy sidecar', async () => {
      expect(await codeOf(h.fabric.acceptSidecar(ADMIN))).toBe('recovery_not_required');
      h.backend.enterRecovery();
      await h.fabric.detect('connect');
      expect(await codeOf(h.fabric.acceptSidecar(ADMIN))).toBe('sidecar_not_initialized');
      expect(h.guard.mismatch).toBe('sidecar_recovery_required');
    });

    it('start-new creates a new fabric on an empty sidecar and keeps the existing recovery key', async () => {
      const before = await h.keys.current();
      const oldFabricId = h.backend.storage?.fabricId;
      h.backend.clear();
      await h.fabric.detect('connect');
      expect(h.guard.mismatch).toBe('sidecar_uninitialized');

      const { status, recoveryKey } = await h.fabric.startNew('Fresh', ADMIN);
      expect(recoveryKey).toBeNull();
      expect((await h.keys.current())?.keyId).toBe(before?.keyId);
      expect(status.recovery.required).toBe(false);
      expect(status.recorded?.fabricId).toBe(h.backend.storage?.fabricId);
      expect(status.backups.stored[0]).toMatchObject({
        trigger: 'fabric_created',
        fabricId: h.backend.storage?.fabricId,
      });
      expect(h.actions()).toEqual(expect.arrayContaining(['matter.recovery_action_chosen', 'matter.fabric_created']));
      const [chosen] = callsOf(h, 'matter.recovery_action_chosen');
      const oldRow = await h.dataSource.getRepository(MatterFabric).findOneByOrFail({ fabricId: oldFabricId });
      expect(chosen).toMatchObject({
        subject: { type: 'matter.fabric', id: auditSubjectId(oldRow.id) },
        details: { fabricRef: oldRow.id, choice: 'start_new' },
      });
    });

    it('start-new audits the choice on the new fabric row when no old one was recorded', async () => {
      await h.dataSource.query('DELETE FROM plugin_matter_fabrics');
      h.backend.enterRecovery();
      await h.fabric.detect('connect');
      h.backend.clear();
      await h.fabric.startNew(undefined, ADMIN);
      const created = await h.dataSource.getRepository(MatterFabric).findOneByOrFail({
        fabricId: h.backend.storage?.fabricId,
      });
      expect(callsOf(h, 'matter.recovery_action_chosen')[0]).toMatchObject({
        subject: { type: 'matter.fabric', id: auditSubjectId(created.id) },
        details: { fabricRef: created.id, choice: 'start_new' },
      });
    });

    it('start-new detaches the old fabric nodes as a fabric mismatch, even after a run saw the empty sidecar', async () => {
      const old = await h.dataSource.getRepository(MatterFabric).findOneByOrFail({ retiredAt: undefined });
      await h.dataSource.getRepository(MatterNode).save({
        id: 'n-1',
        fabricRef: old.id,
        nodeId: '5',
        lifecycleState: 'claimed',
        firstSeenAt: 't',
        lastSeenAt: 't',
        createdAt: 't',
        updatedAt: 't',
      } as MatterNode);
      h.backend.clear();
      // A run saw the empty sidecar before the mismatch was detected: the node is detached for that reason.
      await h.reconciliation.request();
      expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: 'n-1' })).toMatchObject({
        lifecycleState: 'detached',
        detachedReason: 'fabric_absent',
      });
      await h.fabric.detect('connect');

      await h.fabric.startNew(undefined, ADMIN);
      expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: 'n-1' })).toMatchObject({
        lifecycleState: 'detached',
        detachedReason: 'fabric_mismatch',
      });
    });

    it('no other reconciliation applies anything while recovery waits for the administrator', async () => {
      const old = await h.dataSource.getRepository(MatterFabric).findOneByOrFail({ retiredAt: undefined });
      await h.dataSource.getRepository(MatterNode).save({
        id: 'n-1',
        fabricRef: old.id,
        nodeId: '5',
        lifecycleState: 'claimed',
        firstSeenAt: 't',
        lastSeenAt: 't',
        createdAt: 't',
        updatedAt: 't',
      } as MatterNode);
      h.backend.seedFabric('4242', 7);
      await h.fabric.detect('connect');
      const status = await h.reconciliation.request(ADMIN);
      expect(status).toMatchObject({ lastResult: 'skipped_unavailable', lastSummary: { reason: 'recovery_required' } });
      expect(h.connection.requests).not.toContain('inventory.list');
      expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: 'n-1' })).toMatchObject({
        lifecycleState: 'claimed',
      });
      // The administrator's choice reconciles while the plugin is still in recovery.
      await h.fabric.acceptSidecar(ADMIN);
      expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: 'n-1' })).toMatchObject({
        lifecycleState: 'detached',
      });
    });

    it('start-new refuses while the sidecar still has a fabric, and outside recovery', async () => {
      expect(await codeOf(h.fabric.startNew(undefined, ADMIN))).toBe('recovery_not_required');
      h.backend.seedFabric('5', 5);
      await h.fabric.detect('connect');
      expect(await codeOf(h.fabric.startNew(undefined, ADMIN))).toBe('sidecar_not_empty');
    });

    it('both actions need a connected sidecar', async () => {
      h.backend.clear();
      await h.fabric.detect('connect');
      h.connection.setState('degraded');
      expect(await codeOf(h.fabric.startNew(undefined, ADMIN))).toBe('sidecar_unavailable');
      expect(await codeOf(h.fabric.acceptSidecar(ADMIN))).toBe('sidecar_unavailable');
    });
  });

  it('reports an unreachable sidecar as unknown, with every sidecar action off', async () => {
    h.connection.setState('degraded');
    const status = await h.fabric.status();
    expect(status.sidecar).toMatchObject({ reachable: false, state: 'unknown', fabricId: null });
    expect(Object.values(status.actions)).toEqual([false, false, false, false, false]);
  });

  it('survives the sidecar failing the status request', async () => {
    jest.spyOn(h.connection, 'request').mockRejectedValue(new SidecarUnavailableError('down'));
    expect((await h.fabric.status()).sidecar.reachable).toBe(false);
  });
});
