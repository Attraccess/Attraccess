import { createHash } from 'node:crypto';
import { MatterNode } from '../devices/entities';
import { ADMIN, createFabricHarness, type FabricHarness } from '../testing/fabric-harness.test-utils';
import { BACKUP_RETENTION } from './backup.service';
import { MatterBackup } from './entities';
import { decryptBackup, readHeader } from './format';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse?: () => { code?: string } }).getResponse?.().code ?? `unexpected:${String(error)}`;
  }
  return 'no error';
};

describe('MatterBackupService', () => {
  let h: FabricHarness;
  beforeEach(async () => {
    h = await createFabricHarness();
    await h.fabric.create(undefined, ADMIN);
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  const stored = () => h.dataSource.getRepository(MatterBackup).find({ order: { createdAt: 'DESC' } });

  it('stores an encrypted file whose header, hash and size match, and that the recovery key opens', async () => {
    await h.dataSource.getRepository(MatterNode).save({
      id: 'node-1',
      fabricRef: 'x',
      nodeId: '5',
      lifecycleState: 'unclaimed',
      firstSeenAt: 't',
      lastSeenAt: 't',
      createdAt: 't',
      updatedAt: 't',
    } as MatterNode);
    const view = await h.backups.backup('manual', ADMIN);
    const [row] = await stored().then((rows) => rows.filter((r) => r.id === view.id));
    const file = row.blob as Buffer;

    expect(view).toMatchObject({
      trigger: 'manual',
      actor: '7',
      outcome: 'succeeded',
      fabricGeneration: 1,
      sizeBytes: file.length,
    });
    expect(view.sha256).toBe(createHash('sha256').update(file).digest('hex'));
    expect(readHeader(file)).toMatchObject({
      backupId: view.id,
      fabricId: view.fabricId,
      pluginVersion: '0.4.0-alpha.0',
    });
    const key = (await h.keys.currentKey())?.key as Buffer;
    const { body } = decryptBackup(file, key);
    expect(body.sidecar.header.fabricGeneration).toBe(1);
    expect(body.tables['plugin_matter_nodes'].map((r) => r['node_id'])).toEqual(['5']);
    expect(Object.keys(body.tables)).not.toContain('plugin_matter_connection');
    expect(Object.keys(body.tables)).not.toContain('plugin_matter_recovery_keys');
    expect(Object.keys(body.tables)).not.toContain('plugin_matter_backups');
    expect(h.actions()).toEqual(['matter.backup_succeeded']);
  });

  it('records the plugin migration the installation ran last', async () => {
    const view = await h.backups.backup('manual', ADMIN);
    const row = await h.dataSource.getRepository(MatterBackup).findOneByOrFail({ id: view.id });
    expect(row.pluginMigration).toMatch(/^CreateMatterBackup1793900002000$/);
  });

  it('keeps the newest ten and prunes the rest', async () => {
    for (let index = 0; index < BACKUP_RETENTION + 3; index += 1) await h.backups.backup('manual', ADMIN);
    const list = await h.backups.list();
    expect(list).toHaveLength(BACKUP_RETENTION);
    expect((await stored()).filter((row) => row.outcome === 'succeeded')).toHaveLength(BACKUP_RETENTION);
    // Newest first; the first backup (from the fabric creation) is among the pruned ones.
    expect(list.every((entry, i) => i === 0 || list[i - 1].createdAt >= entry.createdAt)).toBe(true);
    expect(list.map((entry) => entry.trigger)).not.toContain('fabric_created');
  });

  it('is single-flight: concurrent requests share one snapshot', async () => {
    const before = h.backend.calls.filter((call) => call === 'backup.snapshot').length;
    const [a, b, c] = await Promise.all([
      h.backups.backup('manual', ADMIN),
      h.backups.backup('daily'),
      h.backups.backup('manual', ADMIN),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(c.id);
    expect(h.backend.calls.filter((call) => call === 'backup.snapshot').length - before).toBe(1);
  });

  it('takes a fresh backup for a pre-restore request even while one is running', async () => {
    const running = h.backups.backup('manual', ADMIN);
    const fresh = await h.backups.backup('pre_restore', ADMIN);
    expect(fresh.id).not.toBe((await running).id);
    expect(fresh.trigger).toBe('pre_restore');
  });

  describe('consistency', () => {
    it('fails as inconsistent when the snapshot has another generation than the plugin recorded', async () => {
      h.backend.faults.snapshotGenerationSkew = 1;
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('inconsistent');
      const status = await h.fabric.status();
      expect(status.backups.lastAttempt).toMatchObject({
        outcome: 'failed',
        trigger: 'manual',
        reason: 'inconsistent',
      });
      expect(h.actions()).toEqual(['matter.backup_failed']);
      expect((h.audit.mock.calls[0] as unknown as [{ outcome: string; details: { reason: string } }])[0]).toMatchObject(
        {
          outcome: 'failed',
          details: { reason: 'inconsistent' },
        },
      );
    });

    it('fails as inconsistent for another fabric ID or storage instance', async () => {
      await h.dataSource.query(
        `UPDATE plugin_matter_fabrics SET storage_instance_id = '00000000-0000-4000-8000-0000000000aa'`,
      );
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('inconsistent');
    });

    it('keeps the stored backups when an attempt fails', async () => {
      h.backend.faults.snapshotGenerationSkew = 2;
      await codeOf(h.backups.backup('daily'));
      expect(await h.backups.list()).toHaveLength(1);
    });
  });

  describe('refusals', () => {
    it.each([
      ['an unreachable sidecar', () => h.connection.setState('degraded'), 'sidecar_unavailable'],
      [
        'plain HTTP to another machine',
        () => {
          h.connection.insecureTransport = true;
        },
        'insecure_transport',
      ],
    ])('refuses and records %s', async (_name, arrange, reason) => {
      arrange();
      const before = h.backend.calls.length;
      await codeOf(h.backups.backup('manual', ADMIN));
      expect(h.backend.calls.length).toBe(before);
      expect((await h.fabric.status()).backups.lastAttempt).toMatchObject({ outcome: 'failed', reason });
    });

    it('answers 409 for insecure transport, 503 for an unreachable sidecar', async () => {
      h.connection.insecureTransport = true;
      await expect(h.backups.backup('manual', ADMIN)).rejects.toMatchObject({ status: 409 });
      h.connection.insecureTransport = false;
      h.connection.setState('degraded');
      await expect(h.backups.backup('manual', ADMIN)).rejects.toMatchObject({ status: 503 });
    });

    it('refuses while the fabric needs recovery', async () => {
      h.backend.clear();
      await h.fabric.detect('connect');
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('recovery_required');
    });

    it('refuses without a fabric record and without a recovery key', async () => {
      const bare = await createFabricHarness();
      expect(await codeOf(bare.backups.backup('manual', ADMIN))).toBe('no_recovery_key');
      await bare.keys.generate(ADMIN);
      expect(await codeOf(bare.backups.backup('manual', ADMIN))).toBe('no_fabric');
      await bare.close();
    });

    it('reports the sidecar being busy, and a failing snapshot', async () => {
      h.backend.busy = true;
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('busy');
      h.backend.busy = false;
      h.backend.faults.snapshotFails = true;
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('sidecar_error');
    });

    it('is busy while a fabric operation of the plugin runs', async () => {
      h.guard.busy = true;
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('busy');
      // Not even recorded as an attempt: nothing was tried.
      expect((await stored()).filter((row) => row.outcome === 'failed')).toHaveLength(0);
    });

    it('treats an unreadable stored key as a failed attempt', async () => {
      await h.dataSource.query(`UPDATE plugin_matter_recovery_keys SET encrypted_key = 'enc:AAAA'`);
      expect(await codeOf(h.backups.backup('manual', ADMIN))).toBe('recovery_key_unreadable');
    });

    it('keeps only the newest failed attempts', async () => {
      h.connection.insecureTransport = true;
      for (let index = 0; index < 23; index += 1) await codeOf(h.backups.backup('manual', ADMIN));
      expect((await stored()).filter((row) => row.outcome === 'failed')).toHaveLength(20);
    });
  });

  describe('listing and download', () => {
    it('lists without the file and downloads the ciphertext with a dated name', async () => {
      const view = await h.backups.backup('manual', ADMIN);
      const [listed] = await h.backups.list();
      expect(JSON.stringify(listed)).not.toContain('blob');
      expect(Object.keys(listed).sort()).toEqual([
        'actor',
        'createdAt',
        'fabricGeneration',
        'fabricId',
        'id',
        'outcome',
        'recoveryKeyId',
        'sha256',
        'sizeBytes',
        'trigger',
      ]);
      const { filename, file } = await h.backups.download(view.id);
      expect(filename).toBe(
        `attraccess-matter-${view.createdAt.slice(0, 10)}-${view.id.slice(0, 8)}.attraccess-matter-backup`,
      );
      expect(createHash('sha256').update(file).digest('hex')).toBe(view.sha256);
      await expect(h.backups.download('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
    });

    it('does not download a failed attempt', async () => {
      h.connection.insecureTransport = true;
      await codeOf(h.backups.backup('manual', ADMIN));
      const failed = (await stored()).find((row) => row.outcome === 'failed');
      await expect(h.backups.download(failed?.id ?? '')).rejects.toMatchObject({ status: 404 });
    });
  });
});

describe('MatterBackupSchedulerService', () => {
  let h: FabricHarness;
  afterEach(() => h.close());

  const make = async (timing = {}) => {
    h = await createFabricHarness({
      timing: { checkMs: 3_600_000, debounceMs: 20, intervalMs: 24 * 3_600_000, ...timing },
    });
  };

  it('takes the daily backup when none is recent, and only then', async () => {
    await make();
    await h.fabric.create(undefined, ADMIN);
    await h.dataSource.query(`UPDATE plugin_matter_backups SET created_at = '2020-01-01T00:00:00.000Z'`);
    await h.scheduler.tick();
    const list = await h.backups.list();
    expect(list.map((entry) => entry.trigger)).toEqual(['daily', 'fabric_created']);
    const calls = h.backend.calls.length;
    await h.scheduler.tick();
    expect(h.backend.calls.slice(calls).filter((call) => call === 'backup.snapshot')).toEqual([]);
    expect((await h.fabric.status()).backups.nextScheduledAt).toBe(
      new Date(new Date(list[0].createdAt).getTime() + 24 * 3_600_000).toISOString(),
    );
  });

  it('does nothing without a fabric, without a connection and in recovery', async () => {
    await make();
    await h.scheduler.tick();
    expect(h.backend.calls).not.toContain('backup.snapshot');

    await h.fabric.create(undefined, ADMIN);
    await h.dataSource.query(`UPDATE plugin_matter_backups SET created_at = '2020-01-01T00:00:00.000Z'`);
    h.connection.setState('degraded');
    await h.scheduler.tick();
    expect(await h.backups.list()).toHaveLength(1);

    h.connection.setState('connected');
    h.backend.clear();
    await h.scheduler.tick();
    expect(await h.backups.list()).toHaveLength(1);
    expect((await h.fabric.status()).backups.nextScheduledAt).toBeNull();
  });

  it('backs up shortly after a generation advance, once for a burst', async () => {
    await make();
    await h.fabric.create(undefined, ADMIN);
    h.scheduler.onModuleInit();
    // Let the connect-time check finish before the generation moves.
    await h.fabric.detect('connect');
    h.backend.generationCounter = 2;
    await h.fabric.detect('event');
    h.backend.generationCounter = 3;
    await h.fabric.detect('event');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const list = await h.backups.list();
    expect(list.filter((entry) => entry.trigger === 'fabric_changed')).toHaveLength(1);
    expect(list[0].fabricGeneration).toBe(3);
    h.scheduler.onModuleDestroy();
  });

  it('skips the change backup when the newest backup already holds the generation', async () => {
    await make();
    await h.fabric.create(undefined, ADMIN);
    const before = (await h.backups.list()).length;
    await h.scheduler.backupAfterChange();
    expect(await h.backups.list()).toHaveLength(before);
  });

  it('starts when the connection comes up and stops when it goes away', async () => {
    await make();
    await h.fabric.create(undefined, ADMIN);
    await h.dataSource.query(`UPDATE plugin_matter_backups SET created_at = '2020-01-01T00:00:00.000Z'`);
    h.connection.setState('degraded');
    h.scheduler.onModuleInit();
    h.connection.setState('connected');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await h.backups.list())[0].trigger).toBe('daily');
    h.connection.setState('degraded');
    expect((await h.fabric.status()).backups.nextScheduledAt).toBeNull();
    h.scheduler.onModuleDestroy();
  });
});
