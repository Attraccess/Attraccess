import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { StreamableFile } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MatterFabricController } from '../fabric/controller';
import { ADMIN, createFabricHarness, type FabricHarness } from '../testing/fabric-harness.test-utils';
import { MatterBackupController } from './controller';

const request = { user: { id: 7, authenticationMethod: 'session' } } as unknown as AuthenticatedRequest;
const status = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 200;
};
const UUID = '3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f';

describe('fabric and backup controllers', () => {
  let h: FabricHarness;
  let fabric: MatterFabricController;
  let backups: MatterBackupController;
  beforeEach(async () => {
    h = await createFabricHarness();
    fabric = new MatterFabricController(h.fabric, h.keys);
    backups = new MatterBackupController(h.backups, h.restore);
  });
  afterEach(() => h.close());

  it.each(['fabric/controller.ts', 'backup/controller.ts'])(
    '%s is guarded by the plugin management permission, with the ATT-1003 marker',
    (file) => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source).toContain("@Auth('system.plugins.manage')");
      expect(source.match(/@Auth\(/g)).toHaveLength(1);
      expect(source).toContain('TODO(ATT-1003)');
      expect(source).toContain("@Controller('matter')");
    },
  );

  it('serves the status and creates the fabric, returning the recovery key in that one answer only', async () => {
    expect(await fabric.status()).toMatchObject({
      sidecar: { state: 'uninitialized' },
      actions: { canCreateFabric: true },
    });
    const created = await fabric.create({ label: 'Home' }, request);
    expect(created.recoveryKey?.key).toMatch(/^[A-Z2-7-]+$/);
    expect(created.status.backups.stored).toHaveLength(1);
    expect(JSON.stringify(await fabric.status())).not.toContain(created.recoveryKey?.key ?? 'x');
    expect((h.audit.mock.calls[0] as unknown as [{ principal: { userId: number } }])[0].principal.userId).toBe(7);
  });

  it('validates every body', async () => {
    expect(await status(() => fabric.create({ label: '' }, request))).toBe(400);
    expect(await status(() => fabric.create({ label: 'x'.repeat(33) }, request))).toBe(400);
    expect(await status(() => fabric.create({ surprise: 1 }, request))).toBe(400);
    expect(await status(() => fabric.acknowledge({ keyId: 'nope' }, request))).toBe(400);
    expect(await status(() => fabric.acknowledge({}, request))).toBe(400);
    expect(await status(() => fabric.rotate({}, request))).toBe(400);
    expect(await status(() => fabric.rotate({ confirm: false }, request))).toBe(400);
    expect(await status(() => fabric.acceptSidecar({ confirm: 'yes' }, request))).toBe(400);
    expect(await status(() => fabric.startNew({}, request))).toBe(400);
    expect(await status(() => backups.validate({}, request))).toBe(400);
    expect(await status(() => backups.validate({ source: { type: 'stored' } }, request))).toBe(400);
    expect(await status(() => backups.validate({ source: { type: 'stored', backupId: 'x' } }, request))).toBe(400);
    expect(await status(() => backups.validate({ source: { type: 'upload', contentBase64: '' } }, request))).toBe(400);
    expect(await status(() => backups.validate({ source: { type: 'other' } }, request))).toBe(400);
    expect(
      await status(() => backups.validate({ source: { type: 'stored', backupId: UUID }, recoveryKey: 1 }, request)),
    ).toBe(400);
    expect(await status(() => backups.confirm({ validationId: 'x' }, request))).toBe(400);
    expect(await status(() => backups.confirm({ validationId: UUID, extra: true }, request))).toBe(400);
    expect(await status(() => backups.cancel('not-a-uuid', request))).toBe(400);
    expect(await status(() => backups.download('../../etc/passwd'))).toBe(400);
  });

  it('does not echo what was submitted in a validation error', async () => {
    const secret = 'MY-SECRET-KEY-ABCD';
    try {
      await backups.validate({ source: { type: 'stored', backupId: 'x' }, recoveryKey: secret, extra: 1 }, request);
    } catch (error) {
      expect(JSON.stringify((error as { getResponse: () => unknown }).getResponse())).not.toContain(secret);
    }
  });

  it('runs the recovery-key routes and the backup routes end to end', async () => {
    const { recoveryKey } = await fabric.create({}, request);
    const acknowledged = await fabric.acknowledge({ keyId: recoveryKey?.keyId }, request);
    expect(acknowledged.recoveryKey.acknowledged).toBe(true);
    const rotated = await fabric.rotate({ confirm: true }, request);
    expect(rotated.keyId).not.toBe(recoveryKey?.keyId);

    const made = await backups.create(request);
    expect(made).toMatchObject({ trigger: 'manual', actor: '7' });
    expect((await backups.list())[0].id).toBe(made.id);
    const download = await backups.download(made.id);
    expect(download).toBeInstanceOf(StreamableFile);
    expect(download.getHeaders()).toMatchObject({
      type: 'application/octet-stream',
      disposition: expect.stringMatching(
        /^attachment; filename="attraccess-matter-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.attraccess-matter-backup"$/,
      ),
    });

    const validation = await backups.validate({ source: { type: 'stored', backupId: made.id } }, request);
    expect(validation.preflight.requiresTypedConfirmation).toBe(true);
    expect(await status(() => backups.confirm({ validationId: validation.validationId }, request))).toBe(409);
    await backups.cancel(validation.validationId, request);
    expect(h.backend.calls).toContain('backup.restore.abort');
    const second = await backups.validate({ source: { type: 'stored', backupId: made.id } }, request);
    const result = await backups.confirm(
      { validationId: second.validationId, confirmFabricId: second.preflight.confirmationFabricId },
      request,
    );
    expect(result.outcome).toBe('succeeded');
  });

  it('maps service failures to the documented statuses', async () => {
    expect(await status(() => backups.create(request))).toBe(409);
    h.backend.enterRecovery();
    await h.fabric.detect('connect');
    expect(await status(() => fabric.create({}, request))).toBe(409);
    expect(await status(() => fabric.acceptSidecar({ confirm: true }, request))).toBe(409);
    expect(await status(() => backups.download(UUID))).toBe(404);
    expect(
      await status(() =>
        backups.validate(
          { source: { type: 'upload', contentBase64: Buffer.from('junk').toString('base64') } },
          request,
        ),
      ),
    ).toBe(422);
    expect(ADMIN.userId).toBe(7);
  });
});
