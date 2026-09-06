import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { WagoCommissioningLeaseEntity } from './wago-commissioning-lease.entity';
import { WagoCommissioningLease1780000000011 } from './wago-commissioning-lease.migration';
import {
  commissioningFingerprintHash,
  createWagoCommissioningLeaseService,
  RepositoryCommissioningLeaseStore,
  WagoCommissioningLeaseService,
  WAGO_COMMISSIONING_MAX_OPERATION_MS,
  WAGO_COMMISSIONING_MAX_REMOTE_COMMAND_MS,
} from './wago-commissioning-lease';
import type { CommissioningLeaseRunner, CommissioningOperationGuard } from './wago-commissioning-lease';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));

const fingerprint = `SHA256:${'a'.repeat(43)}`;
const differentFingerprint = `SHA256:${'b'.repeat(43)}`;
const key = commissioningFingerprintHash(fingerprint);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('commissioning leases on two independent connections to temporary SQLite', () => {
  let directory: string;
  let first: DataSource;
  let second: DataSource;
  let storeA: RepositoryCommissioningLeaseStore;
  let storeB: RepositoryCommissioningLeaseStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-commissioning-lease-'));
    const options = {
      type: 'sqlite' as const,
      database: join(directory, 'lease.sqlite'),
      entities: [WagoCommissioningLeaseEntity],
      migrations: [WagoCommissioningLease1780000000011],
      synchronize: false,
    };
    first = await new DataSource(options).initialize();
    await first.runMigrations();
    second = await new DataSource(options).initialize();
    await Promise.all([first.query('PRAGMA busy_timeout = 2000'), second.query('PRAGMA busy_timeout = 2000')]);
    storeA = new RepositoryCommissioningLeaseStore(() => first.getRepository(WagoCommissioningLeaseEntity));
    storeB = new RepositoryCommissioningLeaseStore(() => second.getRepository(WagoCommissioningLeaseEntity));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([first?.isInitialized && first.destroy(), second?.isInitialized && second.destroy()]);
    await rm(directory, { recursive: true, force: true });
  });

  it('admits exactly one simultaneous session/process for the same fingerprint', async () => {
    const a = new WagoCommissioningLeaseService(storeA);
    const b = new WagoCommissioningLeaseService(storeB);
    const entered = deferred<void>();
    const finish = deferred<void>();
    const rejected = deferred<void>();
    let sideEffects = 0;
    const operation = async (guard: CommissioningOperationGuard) => {
      await guard.assertOwned();
      sideEffects++;
      entered.resolve();
      await finish.promise;
    };
    const attempts = [a.run(fingerprint, operation), b.run(`${fingerprint}=`, operation)].map((attempt) =>
      attempt.catch((error) => {
        rejected.resolve();
        throw error;
      }),
    );
    const results = Promise.allSettled(attempts);
    await Promise.all([entered.promise, rejected.promise]);
    expect(sideEffects).toBe(1);
    expect((await storeA.read(key))?.fingerprintHash).toMatch(/^[a-f0-9]{64}$/);
    finish.resolve();
    const outcomes = await results;
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'lease_busy' } });
    await expect(
      b.run(fingerprint, async (guard) => {
        await guard.assertOwned();
        return 'next session';
      }),
    ).resolves.toBe('next session');
  });

  it('lets different pinned hosts run concurrently', async () => {
    const enteredA = deferred<void>();
    const enteredB = deferred<void>();
    const a = new WagoCommissioningLeaseService(storeA).run(fingerprint, async () => {
      enteredA.resolve();
      await enteredB.promise;
    });
    const b = new WagoCommissioningLeaseService(storeB).run(differentFingerprint, async () => {
      enteredB.resolve();
      await enteredA.promise;
    });
    await Promise.all([a, b]);
    expect(await first.getRepository(WagoCommissioningLeaseEntity).count()).toBe(0);
  });

  it('renews while work runs, and invalidates the guard after completion', async () => {
    const renewed = deferred<void>();
    const initialRead = deferred<void>();
    const original = storeA.renew.bind(storeA);
    jest.spyOn(storeA, 'renew').mockImplementation(async (...args) => {
      await initialRead.promise;
      const result = await original(...args);
      renewed.resolve();
      return result;
    });
    let savedGuard!: CommissioningOperationGuard;
    await new WagoCommissioningLeaseService(storeA, { renewMs: 20 }).run(fingerprint, async (guard) => {
      savedGuard = guard;
      const before = await storeB.read(key);
      initialRead.resolve();
      await renewed.promise;
      const after = await storeB.read(key);
      expect(Number(after?.leaseUntil)).toBeGreaterThan(Number(before?.leaseUntil));
      expect(after?.operationUntil).toBe(before?.operationUntil);
      await guard.assertOwned();
    });
    expect(savedGuard.signal.aborted).toBe(true);
    await expect(savedGuard.assertOwned()).rejects.toThrow('lease_lost');
  });

  it.each(['false', 'throw'] as const)(
    'signals renewal failure (%s), rejects run, and retains the lease',
    async (mode) => {
      const finish = deferred<void>();
      let guard!: CommissioningOperationGuard;
      const run = new WagoCommissioningLeaseService(storeA, { renewMs: 20 }).run(fingerprint, async (value) => {
        guard = value;
        if (mode === 'false') {
          await second
            .getRepository(WagoCommissioningLeaseEntity)
            .update({ fingerprintHash: key }, { owner: 'replacement' });
        } else {
          // A real driver failure after acquisition, not an in-memory lease-store substitute.
          await first.destroy();
        }
        await finish.promise;
      });
      await expect(run).rejects.toThrow('lease_lost');
      expect(guard.signal.aborted).toBe(true);
      await expect(guard.assertOwned()).rejects.toThrow('lease_lost');
      expect(await storeB.read(key)).not.toBeNull();
      await expect(new WagoCommissioningLeaseService(storeB).run(fingerprint, async () => undefined)).rejects.toThrow(
        'lease_busy',
      );
      finish.resolve();
    },
  );

  it('enforces the absolute operation limit even when the callback ignores cancellation', async () => {
    const finish = deferred<void>();
    let guard!: CommissioningOperationGuard;
    const service = new WagoCommissioningLeaseService(storeA, { renewMs: 20, leaseMs: 100, operationMs: 200 });
    await expect(
      service.run(fingerprint, async (value) => {
        guard = value;
        await finish.promise;
      }),
    ).rejects.toThrow('lease_lost');
    expect(guard.signal.aborted).toBe(true);
    expect(await service.status(fingerprint)).toMatchObject({ state: 'stale' });
    expect(await storeB.read(key)).not.toBeNull();
    finish.resolve();
  });

  it('bounds a stalled renewal and prevents its late continuation from releasing the row', async () => {
    const renewing = deferred<void>();
    const unblock = deferred<void>();
    const original = storeA.renew.bind(storeA);
    jest.spyOn(storeA, 'renew').mockImplementation(async (...args) => {
      const result = await original(...args);
      renewing.resolve();
      await unblock.promise;
      return result;
    });
    const release = jest.spyOn(storeA, 'release');
    const service = new WagoCommissioningLeaseService(storeA, { renewMs: 20, leaseMs: 100, operationMs: 500 });
    const started = Date.now();
    await expect(
      service.run(fingerprint, async () => {
        await renewing.promise;
      }),
    ).rejects.toThrow('lease_lost');
    expect(Date.now() - started).toBeLessThan(300);
    unblock.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(release).not.toHaveBeenCalled();
    expect(await storeB.read(key)).not.toBeNull();
  });

  it('fails the guard closed on a database read error and preserves failed-operation recovery state', async () => {
    const service = new WagoCommissioningLeaseService(storeA);
    await expect(
      service.run(fingerprint, async (guard) => {
        jest.spyOn(storeA, 'read').mockRejectedValueOnce(new Error('offline'));
        await guard.assertOwned();
      }),
    ).rejects.toThrow('lease_lost');
    expect(await storeB.read(key)).not.toBeNull();
    await expect(
      service.run(differentFingerprint, async () => {
        throw new Error('remote outcome unknown');
      }),
    ).rejects.toThrow('remote outcome unknown');
    expect(await storeB.read(commissioningFingerprintHash(differentFingerprint))).not.toBeNull();
  });

  it('never steals after a crash/restart, even beyond expiry; recovery checks the owner and drain interval', async () => {
    let now = 1000;
    const operationUntil = now + WAGO_COMMISSIONING_MAX_OPERATION_MS;
    const recoveryAfter = operationUntil + WAGO_COMMISSIONING_MAX_REMOTE_COMMAND_MS;
    await storeA.acquire({
      fingerprintHash: key,
      owner: 'crashed-process',
      leaseUntil: now + 90_000,
      operationUntil,
      recoveryAfter,
    });
    // Close the first connection, as if that process exited without releasing.
    await first.destroy();
    const restarted = new WagoCommissioningLeaseService(storeB, { now: () => now });
    await expect(restarted.run(fingerprint, async () => undefined)).rejects.toThrow('lease_busy');
    now += 90_000;
    expect(await restarted.status(fingerprint)).toEqual({
      state: 'stale',
      owner: 'crashed-process',
      leaseUntil: 91_000,
      operationUntil,
      recoveryAfter,
    });
    expect(await storeB.renew(key, 'crashed-process', now, now + 90_000)).toBe(false);
    const evidence = { owner: 'crashed-process', previousWorkerStopped: true, remoteWorkSettled: true } as const;
    now = recoveryAfter - 1;
    await expect(restarted.recover(fingerprint, evidence)).rejects.toThrow('lease_recovery_refused');
    now++;
    await expect(restarted.run(fingerprint, async () => undefined)).rejects.toThrow('lease_recovery_required');
    await expect(restarted.recover(fingerprint, { ...evidence, owner: 'wrong-owner' })).rejects.toThrow(
      'lease_recovery_refused',
    );
    await restarted.recover(fingerprint, evidence);
    await restarted.run(fingerprint, async (guard) => {
      await expect(restarted.recover(fingerprint, evidence)).rejects.toThrow('lease_recovery_refused');
      expect(await storeB.release(key, 'crashed-process')).toBe(false);
      expect(await storeB.renew(key, 'crashed-process', now, now + 1000)).toBe(false);
      await guard.assertOwned();
    });
    expect(await restarted.status(fingerprint)).toEqual({ state: 'available' });
  });

  it('guards check persisted ownership and deadline before side effects', async () => {
    let now = 1000;
    const service = new WagoCommissioningLeaseService(storeA, { now: () => now });
    await expect(
      service.run(fingerprint, async (guard) => {
        await second
          .getRepository(WagoCommissioningLeaseEntity)
          .update({ fingerprintHash: key }, { owner: 'replacement' });
        await guard.assertOwned();
      }),
    ).rejects.toThrow('lease_lost');
    expect((await storeB.read(key))?.owner).toBe('replacement');
    await expect(
      service.run(differentFingerprint, async (guard) => {
        now = guard.deadline;
        await guard.assertOwned();
      }),
    ).rejects.toThrow('lease_lost');
  });

  it('does not resolve the production repository until used; exposes a small unit-test fake seam', async () => {
    const context = {
      getRepository: jest.fn().mockImplementation(() => first.getRepository(WagoCommissioningLeaseEntity)),
    };
    const service = createWagoCommissioningLeaseService(context);
    expect(context.getRepository).not.toHaveBeenCalled();
    await service.run(fingerprint, async () => undefined);
    expect(context.getRepository).toHaveBeenCalledWith(WagoCommissioningLeaseEntity);
    const fake: CommissioningLeaseRunner = {
      run: async (_fingerprint, operation) =>
        operation({
          assertOwned: async () => undefined,
          signal: new AbortController().signal,
          deadline: Date.now() + 1000,
        }),
    };
    await expect(
      fake.run(fingerprint, async (guard) => {
        await guard.assertOwned();
        return 42;
      }),
    ).resolves.toBe(42);
  });

  it('rejects unpinned targets and cannot downgrade away active or stale leases', async () => {
    const service = new WagoCommissioningLeaseService(storeA);
    await expect(service.run('10.0.0.1', async () => undefined)).rejects.toThrow('pinned SHA256');
    await storeA.acquire({ fingerprintHash: key, owner: 'stale', leaseUntil: 1, operationUntil: 2, recoveryAfter: 3 });
    await expect(first.undoLastMigration()).rejects.toThrow('Recover commissioning leases');
    await service.recover(fingerprint, { owner: 'stale', previousWorkerStopped: true, remoteWorkSettled: true });
    await first.undoLastMigration();
    const runner = first.createQueryRunner();
    try {
      expect(await runner.hasTable('plugin_wago_commissioning_lease')).toBe(false);
    } finally {
      await runner.release();
    }
  });
});
