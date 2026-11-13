// End-to-end recovery: the real Matter sidecar (real matter.js controller and persistent storage), the plugin's backup
// and restore services behind the real host pieces, and a virtual matter.js OnOff light. The light is commissioned and
// toggled through the sidecar's test-only harness (apps/matter-sidecar/src/testing), never through a shipped route.
// Needs mDNS over loopback. Every instance gets its own ports and directories, so the test is parallel-safe; only the
// setup waits for discovery, the assertions run once.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { loadMatterPlatform, type MatterPlatform } from '../../../matter-sidecar/src/matter-platform';
import { createSidecar, type Sidecar } from '../../../matter-sidecar/src/sidecar';
import { configWith, TEST_TOKEN } from '../../../matter-sidecar/src/testing/config';
import { freeUdpPort } from '../../../matter-sidecar/src/testing/ports';
import {
  commissionVirtualDevice,
  startVirtualDevice,
  toggleDevice,
  type VirtualDevice,
} from '../../../matter-sidecar/src/testing/virtual-device';
import { ADMIN, auditRows, bootHost, type Host } from './host.test-utils';

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

type Installation = {
  host: Host;
  sidecar: Sidecar;
  platform: () => MatterPlatform;
  storageDir: string;
  api: () => ReturnType<typeof request>;
};

describe('Matter backup and restore, end to end', () => {
  const directories: string[] = [];
  const installations: Installation[] = [];
  let device: VirtualDevice;

  const tmp = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-recovery-'));
    directories.push(directory);
    return directory;
  };

  /** One installation: a plugin host with a fresh database, and a sidecar with a fresh storage directory. */
  async function install(): Promise<Installation> {
    const storageDir = tmp();
    let platform: MatterPlatform | undefined;
    const sidecar = createSidecar({
      config: configWith({ storageDir }),
      logger: () => undefined,
      loadPlatform: async (context) => (platform = await loadMatterPlatform(context)),
    });
    const { port } = await sidecar.start();
    const host = await bootHost();
    const installation: Installation = {
      host,
      sidecar,
      platform: () => platform as MatterPlatform,
      storageDir,
      api: () => request(host.app.getHttpServer()),
    };
    installations.push(installation);
    await installation
      .api()
      .put('/api/matter/connection')
      .set(ADMIN)
      .send({ url: `http://127.0.0.1:${port}`, credential: TEST_TOKEN })
      .expect(200);
    await until(() => host.service.connection.status().state === 'connected');
    return installation;
  }

  const fabricStatus = async (installation: Installation) =>
    (await installation.api().get('/api/matter/fabric').set(ADMIN).expect(200)).body;

  async function destroy(installation: Installation) {
    installations.splice(installations.indexOf(installation), 1);
    await installation.host.close();
    await installation.sidecar.stop();
    rmSync(installation.storageDir, { recursive: true, force: true });
  }

  beforeAll(async () => {
    device = await startVirtualDevice(tmp(), await freeUdpPort());
  }, 60_000);

  afterAll(async () => {
    await device?.stop();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  afterEach(async () => {
    for (const installation of installations.splice(0)) {
      await installation.host.close().catch(() => undefined);
      await installation.sidecar.stop().catch(() => undefined);
    }
  });

  it('backup -> destroy sidecar storage and plugin database -> restore -> the same device is controllable again', async () => {
    const first = await install();
    const created = (await first.api().post('/api/matter/fabric/create').set(ADMIN).send({}).expect(200)).body;
    const recoveryKey: string = created.recoveryKey.key;
    expect(recoveryKey).toBeTruthy();
    expect(created.status.sidecar).toMatchObject({ state: 'initialized', fabricGeneration: 1 });
    // The first backup is made automatically after the fabric was created.
    await until(async () => (await fabricStatus(first)).backups.stored.length >= 1);
    const fabricId: string = created.status.sidecar.fabricId;

    const controller = first.platform().fabric?.controller;
    if (!controller) throw new Error('the sidecar controller is not running');
    const nodeId = await commissionVirtualDevice(controller);
    expect(device.fabricIds()).toContain(fabricId);
    const initiallyOn = device.isOn();
    await toggleDevice(controller, nodeId);
    expect(device.isOn()).toBe(!initiallyOn);

    // Commissioning is not part of the plugin's registry yet (ATT-1002), so back up now and take the file.
    const backup = (await first.api().post('/api/matter/backups').set(ADMIN).expect(200)).body;
    const file: Buffer = (
      await first
        .api()
        .get(`/api/matter/backups/${backup.id}/download`)
        .set(ADMIN)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200)
    ).body;
    // The file is ciphertext: no key material and no recovery key appear in it.
    expect(file.toString('latin1')).not.toContain(recoveryKey);

    await destroy(first);

    const second = await install();
    expect((await fabricStatus(second)).sidecar.state).toBe('uninitialized');
    const validation = (
      await second
        .api()
        .post('/api/matter/restore/validate')
        .set(ADMIN)
        .send({ source: { type: 'upload', contentBase64: file.toString('base64') }, recoveryKey })
        .expect(200)
    ).body;
    expect(validation.preflight).toMatchObject({
      sidecarState: 'uninitialized',
      kind: 'plain',
      requiresTypedConfirmation: false,
    });
    const restored = (
      await second
        .api()
        .post('/api/matter/restore/confirm')
        .set(ADMIN)
        .send({ validationId: validation.validationId })
        .expect(200)
    ).body;
    expect(restored.outcome).toBe('succeeded');
    expect(restored.status.sidecar).toMatchObject({ state: 'initialized', fabricId });
    // Settled: the plugin recorded exactly the generation the sidecar reached by the restore.
    expect(restored.status.recovery.required).toBe(false);
    expect(restored.status.recorded).toMatchObject({
      fabricId,
      fabricGeneration: restored.status.sidecar.fabricGeneration,
    });
    // This installation had no recovery key: it keeps the one the restore was made with, never showing it again, and
    // the backup after the restore is made under it.
    expect(restored.status.recoveryKey).toMatchObject({ present: true, keyId: validation.backup.recoveryKeyId });
    expect(restored.status.backups.stored[0]).toMatchObject({
      trigger: 'restore',
      recoveryKeyId: validation.backup.recoveryKeyId,
    });
    expect(JSON.stringify(restored)).not.toContain(recoveryKey);

    // No recommissioning: the restored controller talks to the same device, which still lists the Attraccess fabric.
    const restoredController = second.platform().fabric?.controller;
    if (!restoredController) throw new Error('the restored controller is not running');
    const before = device.isOn();
    await toggleDevice(restoredController, nodeId);
    expect(device.isOn()).toBe(!before);
    expect(device.fabricIds()).toContain(fabricId);

    // Audited, and no secret anywhere in the log or the audit trail.
    const audit = JSON.stringify(await auditRows(second.host.db));
    expect(audit).toContain('restore');
    expect(audit).not.toContain(recoveryKey);
    expect(second.host.logs.join('\n')).not.toContain(recoveryKey);
  }, 180_000);

  it('refuses to restore onto a healthy different fabric without the typed confirmation and leaves it intact', async () => {
    const donor = await install();
    const donorCreated = (await donor.api().post('/api/matter/fabric/create').set(ADMIN).send({}).expect(200)).body;
    const donorKey: string = donorCreated.recoveryKey.key;
    await until(async () => (await fabricStatus(donor)).backups.stored.length >= 1);
    const backup = (await fabricStatus(donor)).backups.stored[0];
    const file: Buffer = (
      await donor
        .api()
        .get(`/api/matter/backups/${backup.id}/download`)
        .set(ADMIN)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200)
    ).body;
    await destroy(donor);

    const live = await install();
    const liveCreated = (await live.api().post('/api/matter/fabric/create').set(ADMIN).send({}).expect(200)).body;
    const liveFabricId: string = liveCreated.status.sidecar.fabricId;
    expect(liveFabricId).not.toBe(donorCreated.status.sidecar.fabricId);

    const validation = (
      await live
        .api()
        .post('/api/matter/restore/validate')
        .set(ADMIN)
        .send({ source: { type: 'upload', contentBase64: file.toString('base64') }, recoveryKey: donorKey })
        .expect(200)
    ).body;
    expect(validation.preflight).toMatchObject({
      sidecarState: 'initialized',
      kind: 'replacement',
      requiresTypedConfirmation: true,
      confirmationFabricId: liveFabricId,
    });
    const before = await fabricStatus(live);
    const identity = (status: typeof before) => ({
      fabricId: status.sidecar.fabricId,
      fabricGeneration: status.sidecar.fabricGeneration,
      rootCertFingerprint: status.sidecar.rootCertFingerprint,
      storageInstanceId: status.sidecar.storageInstanceId,
      recorded: status.recorded,
    });
    for (const body of [
      { validationId: validation.validationId },
      { validationId: validation.validationId, confirmFabricId: '1' },
    ]) {
      const refused = await live.api().post('/api/matter/restore/confirm').set(ADMIN).send(body).expect(409);
      expect(refused.body.code).toBe('confirmation_required');
    }
    const after = await fabricStatus(live);
    expect(after.sidecar).toMatchObject({ state: 'initialized', fabricId: liveFabricId });
    expect(identity(after)).toEqual(identity(before));
    expect(after.recovery.required).toBe(false);
    // Refused before anything ran: not even the pre-restore backup.
    expect(after.backups.stored.map((stored: { trigger: string }) => stored.trigger)).not.toContain('pre_restore');
    await live.api().post(`/api/matter/restore/${validation.validationId}/cancel`).set(ADMIN).expect(204);
  }, 180_000);
});
