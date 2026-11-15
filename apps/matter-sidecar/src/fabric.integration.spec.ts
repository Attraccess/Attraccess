import { MAX_BACKUP_BODY_BYTES } from '@attraccess/matter-contract';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { MatterController, type ControllerOptions } from './fabric/controller';
import { loadMatterPlatform, type FabricTuning, type MatterPlatform } from './matter-platform';
import { http, startSidecar, validHeaders, type JsonBody, type Running } from './testing/harness';

const post = (running: Running, path: string, body: unknown) =>
  http(running.port, 'POST', path, {
    headers: { ...validHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (running: Running, path: string) => http(running.port, 'GET', path, { headers: validHeaders() });

/** Hash of every file below `directory`, to prove that a recovery state left the storage untouched. */
function fingerprint(directory: string): string {
  const hash = createHash('sha256');
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(full).update(readFileSync(full));
    }
  };
  walk(directory);
  return hash.digest('hex');
}

/** matter.js keeps writing counters while it runs, so a live fabric is compared by its identity files only. */
const identityOf = (dir: string) =>
  ['sidecar-metadata.json', 'matter/controller/certificates.rootKeyPair', 'matter/controller/fabrics.fabrics'].map(
    (file) => readFileSync(join(dir, file), 'utf8'),
  );

const quarantinesIn = (dir: string) => readdirSync(dir).filter((name) => name.startsWith('quarantine-'));
const generationIn = (dir: string, file = 'sidecar-metadata.json') =>
  JSON.parse(readFileSync(join(dir, file), 'utf8')).fabricGeneration;

/** The state a crash leaves between moving the live storage aside and moving the restored one in. */
function interruptRestore(dir: string) {
  mkdirSync(join(dir, 'restore-rollback'));
  renameSync(join(dir, 'matter'), join(dir, 'restore-rollback', 'matter'));
  renameSync(join(dir, 'sidecar-metadata.json'), join(dir, 'restore-rollback', 'sidecar-metadata.json'));
}

/**
 * The secret key material as matter.js stores it (root CA private key, operational private key, IPK), in every form a
 * leak would take: hex as stored, upper-case hex and base64.
 */
function storedSecrets(storage: string): string[] {
  const hex: string[] = [];
  const visit = (value: unknown, field: string): void => {
    if (typeof value === 'string') {
      const wrapped = /^\{"__object__":"Uint8Array","__value__":"([0-9a-f]+)"\}$/.exec(value);
      if (wrapped && /privateKey|identityProtectionKey/i.test(field)) hex.push(wrapped[1]);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) visit(inner, Array.isArray(value) ? field : key);
  };
  for (const file of ['certificates.rootKeyPair', 'fabrics.fabrics']) {
    visit(JSON.parse(readFileSync(join(storage, 'matter', 'controller', file), 'utf8')), '');
  }
  return hex.flatMap((value) => [value, value.toUpperCase(), Buffer.from(value, 'hex').toString('base64')]);
}

/** Controllers whose stop can be held open and whose next verifications can be made to fail. */
function controllerHooks() {
  const hooks: { hold?: Promise<void>; onStop?: () => void; failVerifications: number } = { failVerifications: 0 };
  const createController = (options: ControllerOptions) => {
    const controller = new MatterController(options);
    const stop = controller.stop.bind(controller);
    controller.stop = async () => {
      hooks.onStop?.();
      await hooks.hold;
      return stop();
    };
    if (hooks.failVerifications > 0) {
      hooks.failVerifications -= 1;
      controller.loadedFacts = async () => ({ fabricId: '1', rootCertFingerprint: '0'.repeat(64) });
    }
    return controller;
  };
  return { hooks, createController };
}

async function until(condition: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

type FabricSidecar = Running & { changes: JsonBody[]; platform: () => MatterPlatform | undefined };

describe('sidecar fabric persistence (real matter.js controller)', () => {
  const directories: string[] = [];
  const running: Running[] = [];
  const newDir = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-sidecar-'));
    directories.push(directory);
    return directory;
  };
  /** Starts a sidecar with the real matter.js platform and records every `fabric.changed` it publishes. */
  const start = async (
    storageDir: string,
    overrides: Parameters<typeof startSidecar>[0] = {},
    tuning: FabricTuning = {},
  ): Promise<FabricSidecar> => {
    const changes: JsonBody[] = [];
    let platform: MatterPlatform | undefined;
    const sidecar = await startSidecar(
      { storageDir, ...overrides },
      {
        loadPlatform: async (context) => {
          const onFabricChanged: typeof context.onFabricChanged = (payload) => {
            changes.push(payload);
            context.onFabricChanged(payload);
          };
          platform = await loadMatterPlatform({ ...context, onFabricChanged }, tuning);
          return platform;
        },
      },
    );
    running.push(sidecar);
    return Object.assign(sidecar, { changes, platform: () => platform });
  };
  const stop = async (sidecar: Running) => {
    await sidecar.stop();
    running.splice(running.indexOf(sidecar), 1);
  };

  afterEach(async () => {
    for (const sidecar of running.splice(0)) await sidecar.stop().catch(() => undefined);
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('creates the storage directory with owner-only permissions and never creates a fabric on its own', async () => {
    const storage = join(newDir(), 'nested', 'storage');
    const sidecar = await start(storage);
    expect(statSync(storage).mode & 0o777).toBe(0o700);
    expect(readdirSync(storage)).toEqual([]);
    const fabric = await get(sidecar, '/v1/fabric');
    expect(fabric.body).toEqual({
      state: 'uninitialized',
      reason: null,
      fabricId: null,
      fabricGeneration: 0,
      rootCertFingerprint: null,
      storageInstanceId: null,
      storageSchemaVersion: 1,
    });
    const capabilities = await get(sidecar, '/v1/capabilities');
    const families = Object.fromEntries(capabilities.body.capabilities.map((c: JsonBody) => [c.family, c.available]));
    expect(families).toMatchObject({ fabric: true, backup: true });
  });

  it('fails with an operational error when the storage directory is not writable', async () => {
    const blocker = join(newDir(), 'file');
    writeFileSync(blocker, 'x');
    await expect(
      startSidecar({ storageDir: join(blocker, 'inner') }, { loadPlatform: loadMatterPlatform }),
    ).rejects.toThrow(/MATTER_SIDECAR_STORAGE_DIR/);
  });

  it('creates one fabric, refuses a second one and keeps it across a restart', async () => {
    const storage = newDir();
    const first = await start(storage);
    const created = await post(first, '/v1/fabric', { label: 'Attraccess' });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ state: 'initialized', reason: null, fabricGeneration: 1 });
    expect(created.body.fabricId).toMatch(/^[0-9]+$/);
    expect(created.body.rootCertFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Public facts only: no key material anywhere in the answer.
    expect(created.raw).not.toMatch(/key|ipk|secret/i);
    expect(statSync(join(storage, 'sidecar-metadata.json')).mode & 0o777).toBe(0o600);

    const again = await post(first, '/v1/fabric', { label: 'Attraccess' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('fabric_exists');
    expect((await get(first, '/health/ready')).body.fabric.state).toBe('initialized');
    const logs = first.logs.join('\n');
    await stop(first);

    const second = await start(storage);
    expect((await get(second, '/v1/fabric')).body).toEqual(created.body);
    expect(logs).not.toContain(created.body.rootCertFingerprint);
    expect(first.changes).toEqual([{ fabricGeneration: 1, fabricId: created.body.fabricId, state: 'initialized' }]);
    expect(second.changes).toEqual([]);
  });

  it('never puts fabric key material in a log line or in any response but the snapshot', async () => {
    const dir = newDir();
    const sidecar = await start(dir);
    const responses: string[] = [];
    const call = async (path: string, body: unknown) => {
      const result = await post(sidecar, path, body);
      responses.push(result.raw);
      return result.body;
    };
    await call('/v1/fabric', { label: 'Attraccess' });
    const snapshot = await snapshotOf(sidecar);
    const { stageId } = await call('/v1/backup/restore/stage', snapshot);
    await call('/v1/backup/restore/commit', { stageId });
    await call('/v1/backup/restore/rollback', { stageId });
    await call('/v1/backup/restore/commit', { stageId });
    responses.push((await get(sidecar, '/v1/fabric')).raw);

    const secrets = storedSecrets(dir);
    // Root CA key, operational key and IPK, each in three forms.
    expect(secrets.length).toBeGreaterThanOrEqual(9);
    // The snapshot is the one place they belong: proof that the search finds them where they are.
    const archive = JSON.parse(gunzipSync(Buffer.from(snapshot.payload, 'base64')).toString('utf8'));
    const files = archive.files.map((file: JsonBody) => Buffer.from(file.data, 'base64').toString('utf8')).join('\n');
    for (const secret of secrets.filter((value) => /^[0-9a-f]+$/.test(value))) expect(files).toContain(secret);
    const exposed = [...sidecar.logs, ...responses].join('\n');
    for (const secret of secrets) expect(exposed).not.toContain(secret);
  });

  describe('storage that cannot be trusted', () => {
    const cases: [string, string, (storage: string) => void][] = [
      ['corrupt metadata', 'storage_corrupt', (s) => writeFileSync(join(s, 'sidecar-metadata.json'), '{not json')],
      [
        'incompatible schema version',
        'schema_mismatch',
        (s) => {
          const file = join(s, 'sidecar-metadata.json');
          writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), storageSchemaVersion: 2 }));
        },
      ],
      ['missing metadata', 'metadata_missing', (s) => rmSync(join(s, 'sidecar-metadata.json'))],
      ['missing matter.js data', 'metadata_orphaned', (s) => rmSync(join(s, 'matter'), { recursive: true })],
      [
        'partially written storage',
        'storage_incomplete',
        (s) => rmSync(join(s, 'matter', 'controller', 'certificates.rootKeyPair')),
      ],
      [
        'a different root certificate than recorded',
        'storage_corrupt',
        (s) => writeFileSync(join(s, 'matter', 'controller', 'certificates.rootCertBytes'), '"garbage"'),
      ],
    ];

    it.each(cases)('%s -> recovery_required, storage untouched, no automatic fabric', async (_name, reason, damage) => {
      const storage = newDir();
      const first = await start(storage);
      expect((await post(first, '/v1/fabric', { label: 'Attraccess' })).status).toBe(200);
      await stop(first);
      damage(storage);
      const before = fingerprint(storage);

      const second = await start(storage);
      const status = (await get(second, '/v1/fabric')).body;
      expect(status).toMatchObject({ state: 'recovery_required', reason, fabricId: null });
      // Readiness stays independent of the fabric state.
      const ready = await get(second, '/health/ready');
      expect(ready.status).toBe(200);
      expect(ready.body.fabric.state).toBe('recovery_required');
      const refused = await post(second, '/v1/fabric', { label: 'Attraccess' });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('recovery_required');
      expect((await post(second, '/v1/backup/snapshot', {})).body.error.code).toBe('recovery_required');
      await stop(second);
      expect(fingerprint(storage)).toBe(before);
    });
  });

  const snapshotOf = async (sidecar: Running) => {
    const result = await post(sidecar, '/v1/backup/snapshot', {});
    expect(result.status).toBe(200);
    return result.body as { header: JsonBody; payload: string };
  };

  describe('backup and two-phase restore', () => {
    const donorSnapshot = async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);
      return snapshot;
    };

    it('restores a snapshot onto a fresh storage directory and resumes the same fabric', async () => {
      const source = await start(newDir());
      const created = (await post(source, '/v1/fabric', { label: 'Attraccess' })).body;
      const snapshot = await snapshotOf(source);
      expect(snapshot.header).toMatchObject({
        fabricId: created.fabricId,
        rootCertFingerprint: created.rootCertFingerprint,
        fabricGeneration: 1,
        storageInstanceId: created.storageInstanceId,
        storageSchemaVersion: 1,
      });
      // The controller was restarted after the snapshot; the source still works.
      expect((await get(source, '/v1/fabric')).body.state).toBe('initialized');
      await stop(source);

      const targetDir = newDir();
      const target = await start(targetDir);
      const staged = await post(target, '/v1/backup/restore/stage', snapshot);
      expect(staged.status).toBe(200);
      expect(staged.body).toMatchObject({ fabricId: created.fabricId, fabricGeneration: 1 });
      // Staging touches nothing live.
      expect((await get(target, '/v1/fabric')).body.state).toBe('uninitialized');
      expect(existsSync(join(targetDir, 'matter'))).toBe(false);

      const committed = await post(target, '/v1/backup/restore/commit', { stageId: staged.body.stageId });
      expect(committed.status).toBe(200);
      expect(committed.body.state).toBe('committed');
      expect(committed.body.fabric).toMatchObject({
        state: 'initialized',
        fabricId: created.fabricId,
        storageInstanceId: created.storageInstanceId,
        fabricGeneration: 2,
      });
      expect(target.changes).toEqual([{ fabricGeneration: 2, fabricId: created.fabricId, state: 'initialized' }]);
      expect((await post(target, '/v1/backup/restore/finalize', { stageId: staged.body.stageId })).body.state).toBe(
        'finalized',
      );
      expect(existsSync(join(targetDir, 'restore-rollback'))).toBe(false);
      await stop(target);

      const resumed = await start(targetDir);
      expect((await get(resumed, '/v1/fabric')).body).toMatchObject({
        state: 'initialized',
        fabricId: created.fabricId,
      });
    });

    it('keeps the previous fabric as a rollback copy and swaps it back on request', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const dir = newDir();
      const live = await start(dir);
      const original = (await post(live, '/v1/fabric', { label: 'Live' })).body;
      expect(original.fabricId).not.toBe(snapshot.header.fabricId);
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      const committed = await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId });
      expect(committed.body.fabric.fabricId).toBe(snapshot.header.fabricId);
      expect(existsSync(join(dir, 'restore-rollback', 'matter'))).toBe(true);

      const rolledBack = await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId });
      expect(rolledBack.body.state).toBe('rolled_back');
      // The restored generation was announced, so the fabric that comes back gets a newer one, never its old one.
      const generation = committed.body.fabric.fabricGeneration + 1;
      expect(rolledBack.body.fabric).toMatchObject({
        fabricId: original.fabricId,
        storageInstanceId: original.storageInstanceId,
        fabricGeneration: generation,
      });
      expect(existsSync(join(dir, 'restore-rollback'))).toBe(false);
      expect(live.changes).toEqual([
        { fabricGeneration: 1, fabricId: original.fabricId, state: 'initialized' },
        { fabricGeneration: 2, fabricId: snapshot.header.fabricId, state: 'initialized' },
        { fabricGeneration: generation, fabricId: original.fabricId, state: 'initialized' },
      ]);
      await stop(live);
      const resumed = await start(dir);
      expect((await get(resumed, '/v1/fabric')).body).toMatchObject({
        state: 'initialized',
        fabricId: original.fabricId,
        fabricGeneration: generation,
      });
    });

    it('puts the previous fabric back and resumes it when the restored one fails verification', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const { hooks, createController } = controllerHooks();
      const dir = newDir();
      const live = await start(dir, {}, { createController });
      const original = (await post(live, '/v1/fabric', { label: 'Live' })).body;
      const before = identityOf(dir);
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      hooks.failVerifications = 1;
      const failed = await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId });
      expect(failed.status).toBe(409);
      expect(failed.body.error.code).toBe('restore_failed');
      expect(identityOf(dir)).toEqual(before);
      expect(readdirSync(dir)).not.toContain('restore-rollback');
      expect(readdirSync(dir)).not.toContain('restore-staging');
      expect(quarantinesIn(dir)).toEqual([]);
      expect((await get(live, '/v1/fabric')).body).toEqual(original);
      expect(live.platform()?.fabric?.controller?.running).toBe(true);
      // Nothing changed, so nothing was announced after the create.
      expect(live.changes).toHaveLength(1);
      expect((await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId })).status).toBe(404);
    });

    it.each<[string, (dir: string) => void]>([
      ['no live storage', () => undefined],
      ['partial live storage', (dir) => writeFileSync(join(dir, 'sidecar-metadata.json'), '{"partial":')],
    ])('leaves an interrupted restore alone: %s and a rollback copy -> restore_interrupted', async (_name, damage) => {
      const dir = newDir();
      const first = await start(dir);
      await post(first, '/v1/fabric', { label: 'Attraccess' });
      await stop(first);
      interruptRestore(dir);
      damage(dir);
      const before = fingerprint(dir);

      const second = await start(dir);
      expect((await get(second, '/v1/fabric')).body).toMatchObject({
        state: 'recovery_required',
        reason: 'restore_interrupted',
      });
      expect((await post(second, '/v1/fabric', { label: 'Attraccess' })).body.error.code).toBe('recovery_required');
      await stop(second);
      expect(fingerprint(dir)).toBe(before);
    });

    describe('starting from an interrupted restore', () => {
      const interrupted = async () => {
        const snapshot = await donorSnapshot();
        const dir = newDir();
        const first = await start(dir);
        await post(first, '/v1/fabric', { label: 'Attraccess' });
        await stop(first);
        interruptRestore(dir);
        const before = fingerprint(dir);
        const { hooks, createController } = controllerHooks();
        const live = await start(dir, {}, { createController });
        const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
        return { dir, live, hooks, stageId: staged.stageId as string, before };
      };
      const expectStillInterrupted = async (live: FabricSidecar, dir: string, before: string) => {
        expect((await get(live, '/v1/fabric')).body).toMatchObject({
          state: 'recovery_required',
          reason: 'restore_interrupted',
        });
        expect((await post(live, '/v1/fabric', { label: 'Attraccess' })).body.error.code).toBe('recovery_required');
        expect(quarantinesIn(dir)).toEqual([]);
        await stop(live);
        expect(fingerprint(dir)).toBe(before);
        const restarted = await start(dir);
        expect((await get(restarted, '/v1/fabric')).body.reason).toBe('restore_interrupted');
      };

      it('keeps restore_interrupted and the leftover rollback copy when the restore fails', async () => {
        const { dir, live, hooks, stageId, before } = await interrupted();
        hooks.failVerifications = 1;
        const failed = await post(live, '/v1/backup/restore/commit', { stageId });
        expect(failed.status).toBe(409);
        expect(failed.body.error.code).toBe('restore_failed');
        await expectStillInterrupted(live, dir, before);
      });

      it('keeps restore_interrupted and the leftover rollback copy when the restore is rolled back', async () => {
        const { dir, live, stageId, before } = await interrupted();
        expect((await post(live, '/v1/backup/restore/commit', { stageId })).body.fabric.state).toBe('initialized');
        expect(quarantinesIn(dir)).toHaveLength(1);
        const rolledBack = await post(live, '/v1/backup/restore/rollback', { stageId });
        expect(rolledBack.status).toBe(200);
        expect(rolledBack.body).toMatchObject({
          state: 'rolled_back',
          fabric: { state: 'recovery_required', reason: 'restore_interrupted' },
        });
        await expectStillInterrupted(live, dir, before);
      });
    });

    it('reports recovery_required when the previous fabric cannot be resumed after a failed restore', async () => {
      const snapshot = await donorSnapshot();
      const { hooks, createController } = controllerHooks();
      const dir = newDir();
      const live = await start(dir, {}, { createController });
      await post(live, '/v1/fabric', { label: 'Live' });
      const before = identityOf(dir);
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      // The restored fabric fails verification, then the previous one fails to resume.
      hooks.failVerifications = 2;
      const failed = await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId });
      expect(failed.status).toBe(409);
      expect(failed.body.error).toMatchObject({ code: 'recovery_required', details: { reason: 'storage_corrupt' } });
      expect((await get(live, '/v1/fabric')).body).toMatchObject({ state: 'recovery_required' });
      expect(live.changes.at(-1)).toEqual({ fabricGeneration: 0, fabricId: null, state: 'recovery_required' });
      // The previous fabric is back in place, untouched, for an administrator.
      expect(identityOf(dir)).toEqual(before);
      expect(readdirSync(dir)).not.toContain('restore-rollback');
    });

    it('reports recovery_required when the rolled-back fabric cannot be resumed', async () => {
      const snapshot = await donorSnapshot();
      const { hooks, createController } = controllerHooks();
      const dir = newDir();
      const live = await start(dir, {}, { createController });
      await post(live, '/v1/fabric', { label: 'Live' });
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      const committed = (await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId })).body;
      hooks.failVerifications = 1;
      const failed = await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId });
      expect(failed.status).toBe(409);
      expect(failed.body.error).toMatchObject({ code: 'recovery_required', details: { reason: 'storage_corrupt' } });
      expect(live.changes.at(-1)).toMatchObject({ state: 'recovery_required' });
      // The previous fabric is back with a generation above the announced one, so a restart never goes backwards.
      expect(generationIn(dir)).toBe(committed.fabric.fabricGeneration + 1);
      expect((await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId })).status).toBe(404);
    });

    it('changes nothing when the rollback copy cannot be prepared, and rolls back on the next attempt', async () => {
      const snapshot = await donorSnapshot();
      const dir = newDir();
      const live = await start(dir);
      const original = (await post(live, '/v1/fabric', { label: 'Live' })).body;
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      const committed = (await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId })).body;
      chmodSync(join(dir, 'restore-rollback'), 0o500);
      const failed = await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId });
      chmodSync(join(dir, 'restore-rollback'), 0o700);
      expect(failed.status).toBe(500);
      expect(failed.body.error.code).toBe('internal_error');
      expect((await get(live, '/v1/fabric')).body).toEqual(committed.fabric);
      expect(live.platform()?.fabric?.controller?.running).toBe(true);
      expect(generationIn(dir, 'restore-rollback/sidecar-metadata.json')).toBe(original.fabricGeneration);

      const rolledBack = await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId });
      expect(rolledBack.body).toMatchObject({
        state: 'rolled_back',
        fabric: { fabricId: original.fabricId, fabricGeneration: committed.fabric.fabricGeneration + 1 },
      });
    });

    it('quarantines a rollback copy left next to a healthy fabric and resumes the fabric', async () => {
      const dir = newDir();
      const first = await start(dir);
      const created = (await post(first, '/v1/fabric', { label: 'Attraccess' })).body;
      await stop(first);
      mkdirSync(join(dir, 'restore-rollback', 'matter'), { recursive: true });
      writeFileSync(join(dir, 'restore-rollback', 'matter', 'leftover'), 'previous fabric');

      const second = await start(dir);
      expect((await get(second, '/v1/fabric')).body).toEqual(created);
      expect(readdirSync(dir)).not.toContain('restore-rollback');
      const [quarantine, ...others] = quarantinesIn(dir);
      expect(others).toEqual([]);
      expect(readFileSync(join(dir, quarantine, 'matter', 'leftover'), 'utf8')).toBe('previous fabric');
      expect(statSync(join(dir, quarantine)).mode & 0o777).toBe(0o700);
      expect(second.logs.join('\n')).toContain('quarantine');
    });

    it('quarantines the rollback copy when neither finalize nor rollback arrives in time', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const dir = newDir();
      const live = await start(dir, {}, { pendingTtlMs: 300 });
      await post(live, '/v1/fabric', { label: 'Live' });
      const staged = (await post(live, '/v1/backup/restore/stage', snapshot)).body;
      expect((await post(live, '/v1/backup/restore/commit', { stageId: staged.stageId })).status).toBe(200);
      await until(() => !existsSync(join(dir, 'restore-rollback')));
      const [quarantine] = quarantinesIn(dir);
      expect(existsSync(join(dir, quarantine, 'matter', 'controller'))).toBe(true);
      expect((await post(live, '/v1/backup/restore/finalize', { stageId: staged.stageId })).status).toBe(404);
      expect((await post(live, '/v1/backup/restore/rollback', { stageId: staged.stageId })).status).toBe(404);
      expect((await get(live, '/v1/fabric')).body.fabricId).toBe(snapshot.header.fabricId);
    });

    it('removes an expired stage from disk without waiting for its next use', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const dir = newDir();
      const target = await start(dir, {}, { stageTtlMs: 300 });
      const staged = (await post(target, '/v1/backup/restore/stage', snapshot)).body;
      expect(existsSync(join(dir, 'restore-staging'))).toBe(true);
      await until(() => !existsSync(join(dir, 'restore-staging')));
      expect((await post(target, '/v1/backup/restore/commit', { stageId: staged.stageId })).status).toBe(404);
    });

    it('rejects a corrupt, incomplete or incompatible snapshot before touching live storage', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const dir = newDir();
      const live = await start(dir);
      await post(live, '/v1/fabric', { label: 'Live' });
      const before = identityOf(dir);
      const flipped = Buffer.from(snapshot.payload, 'base64');
      flipped[flipped.length - 20] ^= 0xff;
      const attempts: [string, JsonBody][] = [
        ['corrupt', { header: snapshot.header, payload: flipped.toString('base64') }],
        ['corrupt', { header: snapshot.header, payload: snapshot.payload.slice(0, 200) }],
        ['incompatible_schema', { header: { ...snapshot.header, storageSchemaVersion: 2 }, payload: snapshot.payload }],
        [
          'incompatible_matter_js',
          { header: { ...snapshot.header, matterJsVersion: '0.99.0' }, payload: snapshot.payload },
        ],
        ['corrupt', { header: { ...snapshot.header, fabricId: '1' }, payload: snapshot.payload }],
      ];
      for (const [code, body] of attempts) {
        const result = await post(live, '/v1/backup/restore/stage', body);
        expect(result.status).toBe(422);
        expect(result.body.error).toMatchObject({ code: 'invalid_backup', details: { code } });
      }
      expect(identityOf(dir)).toEqual(before);
      expect(existsSync(join(dir, 'restore-staging'))).toBe(false);
      expect((await post(live, '/v1/backup/restore/commit', { stageId: crypto.randomUUID() })).status).toBe(404);
    });

    it('discards staged data on abort', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      const dir = newDir();
      const target = await start(dir);
      const staged = (await post(target, '/v1/backup/restore/stage', snapshot)).body;
      expect(existsSync(join(dir, 'restore-staging', staged.stageId))).toBe(true);
      expect((await post(target, '/v1/backup/restore/abort', { stageId: staged.stageId })).body.state).toBe('aborted');
      expect(readdirSync(dir)).not.toContain('restore-staging');
      expect((await post(target, '/v1/backup/restore/commit', { stageId: staged.stageId })).status).toBe(404);
    });

    it('removes a stage that an earlier process left behind', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      const dir = newDir();
      const first = await start(dir);
      await post(first, '/v1/backup/restore/stage', snapshot);
      expect(readdirSync(join(dir, 'restore-staging'))).toHaveLength(1);
      await stop(first);
      await start(dir);
      expect(readdirSync(dir)).not.toContain('restore-staging');
    });

    it('rejects fabric-mutating operations while a snapshot is being taken', async () => {
      const { hooks, createController } = controllerHooks();
      const sidecar = await start(newDir(), {}, { createController });
      await post(sidecar, '/v1/fabric', { label: 'Attraccess' });
      const spare = await snapshotOf(sidecar);
      // The snapshot is held open while it stops the controller, so every other operation meets it in progress.
      let release = () => undefined as void;
      hooks.hold = new Promise<void>((resolve) => (release = resolve));
      const stopping = new Promise<void>((resolve) => (hooks.onStop = resolve));
      const snapshot = post(sidecar, '/v1/backup/snapshot', {});
      await stopping;
      for (const [path, body] of [
        ['/v1/fabric', { label: 'Attraccess' }],
        ['/v1/backup/restore/stage', spare],
        ['/v1/backup/snapshot', {}],
      ] as const) {
        const refused = await post(sidecar, path, body);
        expect(refused.status).toBe(409);
        expect(refused.body.error.code).toBe('busy');
      }
      hooks.onStop = undefined;
      hooks.hold = undefined;
      release();
      expect((await snapshot).status).toBe(200);
      expect((await post(sidecar, '/v1/backup/restore/stage', spare)).status).toBe(200);
    });

    it('lets close() wait for a snapshot in progress and leaves no controller running', async () => {
      const { hooks, createController } = controllerHooks();
      const sidecar = await start(newDir(), {}, { createController });
      await post(sidecar, '/v1/fabric', { label: 'Attraccess' });
      let release = () => undefined as void;
      hooks.hold = new Promise<void>((resolve) => (release = resolve));
      const stopping = new Promise<void>((resolve) => (hooks.onStop = resolve));
      const snapshot = post(sidecar, '/v1/backup/snapshot', {});
      await stopping;
      const fabric = sidecar.platform()?.fabric;
      const closing = fabric?.close();
      hooks.onStop = undefined;
      hooks.hold = undefined;
      release();
      await closing;
      expect((await snapshot).status).toBe(200);
      expect(fabric?.controller).toBeUndefined();
      const refused = await post(sidecar, '/v1/backup/snapshot', {});
      expect(refused.status).toBe(503);
      expect(refused.body.error.code).toBe('sidecar_unavailable');
    });
  });

  describe('transport and limits', () => {
    it('refuses backup and restore over plain HTTP on a non-loopback bind, but not other operations', async () => {
      const sidecar = await start(newDir(), { insecureRemote: true });
      for (const path of [
        '/v1/backup/snapshot',
        '/v1/backup/restore/stage',
        '/v1/backup/restore/commit',
        '/v1/backup/restore/rollback',
        '/v1/backup/restore/finalize',
        '/v1/backup/restore/abort',
      ]) {
        const result = await post(sidecar, path, {});
        expect(result.status).toBe(403);
        expect(result.body.error.code).toBe('insecure_transport');
      }
      expect((await get(sidecar, '/v1/fabric')).status).toBe(200);
    });

    it('keeps the general body limit and gives the backup operations their own', async () => {
      const sidecar = await start(newDir());
      const big = 'x'.repeat(2 * 1024 * 1024);
      const general = await post(sidecar, '/v1/fabric', { label: big });
      expect(general.status).toBe(413);
      expect(general.body.error.details.limitBytes).toBe(1024 * 1024);
      // Over the general limit but inside the backup limit: reaches validation instead of being cut off.
      const backup = await post(sidecar, '/v1/backup/restore/stage', { header: {}, payload: big });
      expect(backup.status).toBe(400);
      const sized = (bytes: number) =>
        http(sidecar.port, 'POST', '/v1/backup/restore/stage', {
          headers: { ...validHeaders(), 'content-type': 'application/json' },
          body: Buffer.alloc(bytes, 0x20),
        });
      // Exactly at the limit is read in full: it fails as JSON, not on its size.
      const atLimit = await sized(MAX_BACKUP_BODY_BYTES);
      expect(atLimit.status).toBe(400);
      expect(atLimit.body.error.code).toBe('validation_failed');
      const over = await sized(MAX_BACKUP_BODY_BYTES + 1);
      expect(over.status).toBe(413);
      expect(over.body.error.details.limitBytes).toBe(MAX_BACKUP_BODY_BYTES);
    });
  });
});
