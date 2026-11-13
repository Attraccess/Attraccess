import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMatterPlatform } from './matter-platform';
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

describe('sidecar fabric persistence (real matter.js controller)', () => {
  const directories: string[] = [];
  const running: Running[] = [];
  const newDir = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-sidecar-'));
    directories.push(directory);
    return directory;
  };
  const start = async (storageDir: string, overrides: Parameters<typeof startSidecar>[0] = {}) => {
    const sidecar = await startSidecar({ storageDir, ...overrides }, { loadPlatform: loadMatterPlatform });
    running.push(sidecar);
    return sidecar;
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
      expect(rolledBack.body.fabric).toMatchObject({
        fabricId: original.fabricId,
        storageInstanceId: original.storageInstanceId,
        fabricGeneration: original.fabricGeneration,
      });
      expect(existsSync(join(dir, 'restore-rollback'))).toBe(false);
    });

    it('rejects a corrupt, incomplete or incompatible snapshot before touching live storage', async () => {
      const donor = await start(newDir());
      await post(donor, '/v1/fabric', { label: 'Donor' });
      const snapshot = await snapshotOf(donor);
      await stop(donor);

      const dir = newDir();
      const live = await start(dir);
      await post(live, '/v1/fabric', { label: 'Live' });
      // matter.js keeps writing counters while it runs, so the identity files are compared, not the whole tree.
      const identity = () =>
        [
          'sidecar-metadata.json',
          'matter/controller/certificates.rootKeyPair',
          'matter/controller/fabrics.fabrics',
        ].map((file) => readFileSync(join(dir, file), 'utf8'));
      const before = identity();
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
      expect(identity()).toEqual(before);
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
      const sidecar = await start(newDir());
      await post(sidecar, '/v1/fabric', { label: 'Attraccess' });
      const spare = await snapshotOf(sidecar);
      const [first, second] = await Promise.all([
        post(sidecar, '/v1/backup/snapshot', {}),
        post(sidecar, '/v1/backup/restore/stage', spare),
      ]);
      const statuses = [first.status, second.status];
      expect(statuses).toContain(200);
      const refused = [first, second].find((result) => result.status === 409);
      expect(refused?.body.error.code).toBe('busy');
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
      const over = await http(sidecar.port, 'POST', '/v1/backup/restore/stage', {
        headers: { ...validHeaders(), 'content-type': 'application/json' },
        body: Buffer.alloc(64 * 1024 * 1024 + 1, 0x20),
      });
      expect(over.status).toBe(413);
      expect(over.body.error.details.limitBytes).toBe(64 * 1024 * 1024);
    });
  });
});
