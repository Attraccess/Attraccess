// The services against a real SidecarConnection and an HTTP fake sidecar: the typed client calls, the larger body
// limits of the backup operations, the sidecar's own refusals, and the fabric.changed event path.
import { MAX_MESSAGE_BYTES } from '@attraccess/matter-contract';
import { MatterConnectionService } from '../connection/connection.service';
import { MatterSettingsService } from '../connection/settings.service';
import { SidecarHttpClient } from '../client/rest-client';
import { SidecarClientError } from '../client/errors';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { MatterFabricGuard } from '../fabric/guard';
import { MatterFabricService } from '../fabric/fabric.service';
import { RecoveryKeyService } from '../fabric/recovery-key.service';
import { FakeFabricBackend } from '../testing/fake-fabric';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar';
import { ADMIN, createHarness, type Harness } from '../testing/devices-harness.test-utils';
import { MatterBackupService } from './backup.service';
import { MatterRestoreService } from './restore.service';

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('backup and restore over the HTTP client', () => {
  let h: Harness;
  let fake: FakeSidecar;
  let backend: FakeFabricBackend;
  let connection: MatterConnectionService;
  let fabric: MatterFabricService;
  let backups: MatterBackupService;
  let restore: MatterRestoreService;

  beforeEach(async () => {
    h = await createHarness();
    fake = await FakeSidecar.start();
    backend = fake.fabricBackend = new FakeFabricBackend();
    const settings = new MatterSettingsService(h.context);
    await settings.save({ url: fake.url, credential: TOKEN }, 1);
    connection = new MatterConnectionService(h.context, settings);
    const guard = new MatterFabricGuard();
    const audit = new DeviceAuditService(h.context);
    const keys = new RecoveryKeyService(h.context, audit);
    const reader = async () =>
      (
        (await h.dataSource.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1')) as { name: string }[]
      )[0]?.name ?? null;
    const reconciliation = new MatterReconciliationService(h.context, connection, audit);
    backups = new MatterBackupService(h.context, connection, keys, audit, guard, reader);
    fabric = new MatterFabricService(h.context, connection, guard, keys, backups, audit, reconciliation);
    restore = new MatterRestoreService(
      h.context,
      connection,
      keys,
      backups,
      fabric,
      guard,
      audit,
      reconciliation,
      reader,
    );
    await connection.onModuleInit();
    await until(() => connection.connection.status().state === 'connected');
  });
  afterEach(async () => {
    fabric.onModuleDestroy();
    connection.onModuleDestroy();
    await fake.stop();
    await h.close();
  });

  it('creates a fabric, then backs up and restores a snapshot larger than the general message limit', async () => {
    await fabric.create('Home', ADMIN);
    // The snapshot (and so the stage request) is far beyond the 1 MiB that every other operation is limited to.
    (backend.storage as { secret: string }).secret = 'k'.repeat(2 * MAX_MESSAGE_BYTES);
    const view = await backups.backup('manual', ADMIN);
    expect(view.sizeBytes).toBeGreaterThan(0);
    const snapshots = fake.requests.filter((r) => r.path === '/v1/backup/snapshot');
    expect(snapshots).toHaveLength(2);

    const validation = await restore.validate({ type: 'stored', backupId: view.id }, undefined, ADMIN);
    expect(validation.preflight.kind).toBe('rollback');
    const result = await restore.confirm(
      validation.validationId,
      validation.preflight.confirmationFabricId ?? '',
      ADMIN,
    );
    expect(result.status.sidecar.fabricGeneration).toBe(2);
    expect(result.status.recovery.required).toBe(false);
    expect(fake.requests.map((r) => r.path)).toEqual(
      expect.arrayContaining(['/v1/backup/restore/stage', '/v1/backup/restore/commit', '/v1/backup/restore/finalize']),
    );
    // Every versioned request went out with the release headers and the token.
    expect(
      fake.requests
        .filter((r) => r.path.startsWith('/v1/backup'))
        .every((r) => r.headers.authorization === `Bearer ${TOKEN}`),
    ).toBe(true);
  });

  it('passes the sidecar refusals through as typed answers', async () => {
    await fabric.create(undefined, ADMIN);
    backend.insecure = true;
    await expect(backups.backup('manual', ADMIN)).rejects.toMatchObject({ response: { code: 'insecure_transport' } });
    backend.insecure = false;
    backend.busy = true;
    await expect(backups.backup('manual', ADMIN)).rejects.toMatchObject({ response: { code: 'busy' } });
    backend.busy = false;
    await expect(fabric.create(undefined, ADMIN)).rejects.toMatchObject({ response: { code: 'fabric_exists' } });
  });

  it('detects a generation change reported by a fabric.changed event', async () => {
    await fabric.create(undefined, ADMIN);
    fabric.onModuleInit();
    await fabric.detect('connect');
    backend.generationCounter = 0;
    fake.broadcast(fake.nextEvent({ type: 'fabric.changed', payload: { fabricGeneration: 0 } } as never));
    await until(async () => (await fabric.status()).recovery.required);
    expect((await fabric.status()).recovery.mismatch).toBe('generation_behind');
  });
});

describe('SidecarHttpClient limits for the backup operations', () => {
  let fake: FakeSidecar;
  let client: SidecarHttpClient;
  beforeEach(async () => {
    fake = await FakeSidecar.start();
    fake.fabricBackend = new FakeFabricBackend();
    client = new SidecarHttpClient(
      { url: fake.url, token: TOKEN },
      { attraccessVersion: HOST_VERSION, pluginVersion: entry.plugin, sidecarVersion: entry.sidecar },
    );
  });
  afterEach(async () => {
    client.close();
    await fake.stop();
  });

  it('refuses locally a request body above the backup limit, without sending it', async () => {
    const header = {
      storageSchemaVersion: 1,
      sidecarVersion: entry.sidecar,
      matterJsVersion: entry.matterJs,
      fabricId: '1',
      rootCertFingerprint: 'a'.repeat(64),
      fabricGeneration: 1,
      storageInstanceId: '3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f',
      payloadSha256: 'b'.repeat(64),
      payloadBytes: 1,
      createdAt: '2026-11-01T10:00:00.000Z',
    };
    const error = await client
      .call('backup.restore.stage', { body: { header, payload: 'A'.repeat(65 * 1024 * 1024) } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SidecarClientError);
    expect((error as SidecarClientError).code).toBe('payload_too_large');
    expect(fake.requests.filter((r) => r.path.includes('/backup/'))).toEqual([]);
  });

  it('keeps the general limit for every other operation', async () => {
    fake.restOverride = (req, res) => {
      if (req.url !== '/v1/fabric') return 'pass';
      const padding = JSON.stringify({ padding: 'x'.repeat(MAX_MESSAGE_BYTES + 10) });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(padding) });
      res.end(padding);
    };
    await expect(client.call('fabric.get')).rejects.toBeInstanceOf(SidecarClientError);
  });
});
