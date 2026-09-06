import { createHash, randomUUID } from 'node:crypto';
import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningLeaseEntity } from './wago-commissioning-lease.entity';

export const WAGO_COMMISSIONING_MAX_OPERATION_MS = 30 * 60_000;
export const WAGO_COMMISSIONING_MAX_REMOTE_COMMAND_MS = 30 * 60_000;

export interface CommissioningOperationGuard {
  /** Check immediately before EVERY device, broker, or persistent mutation, including rollback. */
  assertOwned(): Promise<void>;
  /** Aborted on expiry, renewal/read failure, or completion. Pass to cancellable work. */
  readonly signal: AbortSignal;
  readonly deadline: number;
}

/** Minimal injection seam for service unit tests; no TypeORM query-builder fake is required. */
export interface CommissioningLeaseRunner {
  run<T>(fingerprint: string, operation: (guard: CommissioningOperationGuard) => Promise<T>): Promise<T>;
}

import type { CommissioningLeaseStatus } from '../shared/commissioning';
export type { CommissioningLeaseStatus } from '../shared/commissioning';

export class CommissioningLeaseError extends Error {
  constructor(readonly code: 'lease_busy' | 'lease_lost' | 'lease_recovery_required' | 'lease_recovery_refused') {
    super(code);
    this.name = 'CommissioningLeaseError';
  }
}

export function commissioningFingerprintHash(fingerprint: string): string {
  const normalized = fingerprint.trim().replace(/=$/, '');
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(normalized)) throw new Error('A pinned SHA256 host fingerprint is required');
  return createHash('sha256').update(normalized).digest('hex');
}

/** Narrow persistence seam. Production always uses the plugin repository, never a process map. */
export interface CommissioningLeaseStore {
  acquire(row: WagoCommissioningLeaseEntity): Promise<boolean>;
  read(key: string): Promise<WagoCommissioningLeaseEntity | null>;
  renew(key: string, owner: string, now: number, until: number): Promise<boolean>;
  release(key: string, owner: string): Promise<boolean>;
  recover(key: string, owner: string, now: number): Promise<boolean>;
}

export class RepositoryCommissioningLeaseStore implements CommissioningLeaseStore {
  constructor(private readonly getRepository: () => Repository<WagoCommissioningLeaseEntity>) {}

  async acquire(row: WagoCommissioningLeaseEntity): Promise<boolean> {
    const repository = this.getRepository();
    // The primary key arbitrates simultaneous inserts across processes. Expiry NEVER authorizes overwrite.
    await repository.createQueryBuilder().insert().values(row).orIgnore().execute();
    return (await this.read(row.fingerprintHash))?.owner === row.owner;
  }

  read(fingerprintHash: string): Promise<WagoCommissioningLeaseEntity | null> {
    return this.getRepository().findOneBy({ fingerprintHash });
  }

  async renew(key: string, owner: string, now: number, until: number): Promise<boolean> {
    const result = await this.getRepository()
      .createQueryBuilder()
      .update()
      .set({ leaseUntil: until })
      .where(
        'fingerprint_hash = :key AND owner = :owner AND lease_until > :now AND operation_until > :now AND operation_until >= :until',
        { key, owner, now, until },
      )
      .execute();
    return result.affected === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const result = await this.getRepository()
      .createQueryBuilder()
      .delete()
      .where('fingerprint_hash = :key AND owner = :owner', { key, owner })
      .execute();
    return result.affected === 1;
  }

  async recover(key: string, owner: string, now: number): Promise<boolean> {
    const result = await this.getRepository()
      .createQueryBuilder()
      .delete()
      .where(
        'fingerprint_hash = :key AND owner = :owner AND lease_until <= :now AND operation_until <= :now AND recovery_after <= :now',
        { key, owner, now },
      )
      .execute();
    return result.affected === 1;
  }
}

/**
 * Wrap ALL install/recover/Docker/security/claim/revoke/delete paths with the SAME pinned fingerprint.
 * The callback must await all side effects; successful completion means remote work is also settled.
 * A thrown callback, lost heartbeat, or deadline leaves the row for explicit recovery.
 *
 * There is no remote fencing token in SSH or the broker: assertOwned cannot close the pause between
 * checking ownership and sending a command. Consequently NO automatic takeover is safe, even after
 * 30 minutes. Restart only observes the row. Explicit recovery requires the former worker to be
 * stopped (not merely paused), remote work confirmed settled, AND operationUntil + 30 minutes elapsed.
 * A local SSH timeout/AbortSignal alone is NOT proof that remote work stopped. Every remote command
 * must have a 30 minute bound; operations have a non-renewable 30 minute maximum too.
 * This serializes cooperating callers; it does not make broker/device/database writes atomic.
 */
export class WagoCommissioningLeaseService implements CommissioningLeaseRunner {
  private readonly now: () => number;
  private readonly leaseMs: number;
  private readonly renewMs: number;
  private readonly operationMs: number;

  constructor(
    private readonly store: CommissioningLeaseStore,
    options: {
      now?: () => number;
      leaseMs?: number;
      renewMs?: number;
      operationMs?: number;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.leaseMs = options.leaseMs ?? 90_000;
    this.renewMs = options.renewMs ?? 30_000;
    this.operationMs = options.operationMs ?? WAGO_COMMISSIONING_MAX_OPERATION_MS;
    if (
      ![this.leaseMs, this.renewMs, this.operationMs].every((value) => Number.isSafeInteger(value) && value > 0) ||
      this.renewMs >= this.leaseMs ||
      this.leaseMs > this.operationMs ||
      this.operationMs > WAGO_COMMISSIONING_MAX_OPERATION_MS
    )
      throw new Error('Invalid commissioning lease timing');
  }

  async status(fingerprint: string): Promise<CommissioningLeaseStatus> {
    const row = await this.store.read(commissioningFingerprintHash(fingerprint));
    if (!row) return { state: 'available' };
    return {
      state: Math.min(Number(row.leaseUntil), Number(row.operationUntil)) > this.now() ? 'active' : 'stale',
      owner: row.owner,
      leaseUntil: Number(row.leaseUntil),
      operationUntil: Number(row.operationUntil),
      recoveryAfter: Number(row.recoveryAfter),
    };
  }

  /** An operator recovery action, never a startup hook. Use the owner returned by status(). */
  async recover(
    fingerprint: string,
    evidence: {
      owner: string;
      previousWorkerStopped: true;
      remoteWorkSettled: true;
    },
  ): Promise<void> {
    if (
      evidence.previousWorkerStopped !== true ||
      evidence.remoteWorkSettled !== true ||
      !(await this.store.recover(commissioningFingerprintHash(fingerprint), evidence.owner, this.now()))
    ) {
      throw new CommissioningLeaseError('lease_recovery_refused');
    }
  }

  async run<T>(fingerprint: string, operation: (guard: CommissioningOperationGuard) => Promise<T>): Promise<T> {
    const key = commissioningFingerprintHash(fingerprint);
    const owner = randomUUID();
    const started = this.now();
    const deadline = started + this.operationMs;
    if (
      !(await this.store.acquire({
        fingerprintHash: key,
        owner,
        leaseUntil: started + this.leaseMs,
        operationUntil: deadline,
        recoveryAfter: deadline + WAGO_COMMISSIONING_MAX_REMOTE_COMMAND_MS,
      }))
    ) {
      const status = await this.status(fingerprint);
      throw new CommissioningLeaseError(status.state === 'stale' ? 'lease_recovery_required' : 'lease_busy');
    }

    const controller = new AbortController();
    let stopped = false;
    let heartbeatStopped = false;
    let renewal: Promise<void> | undefined;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let confirmedLeaseUntil = started + this.leaseMs;
    let rejectLost!: (error: Error) => void;
    const lost = new Promise<never>((_, reject) => {
      rejectLost = reject;
    });
    // assertOwned may fail before Promise.race is installed.
    void lost.catch(() => undefined);
    const fail = () => {
      const error = new CommissioningLeaseError('lease_lost');
      if (!controller.signal.aborted) {
        controller.abort(error);
        rejectLost(error);
      }
      return error;
    };
    const assertOwned = async () => {
      if (stopped || controller.signal.aborted || this.now() >= deadline) throw fail();
      try {
        const row = await this.store.read(key);
        if (
          stopped ||
          controller.signal.aborted ||
          !row ||
          row.owner !== owner ||
          this.now() >= Math.min(Number(row.leaseUntil), Number(row.operationUntil), deadline)
        )
          throw fail();
      } catch {
        throw fail();
      }
    };
    const scheduleExpiry = () => {
      clearTimeout(expiry);
      expiry = setTimeout(fail, Math.max(0, confirmedLeaseUntil - this.now()));
    };
    const schedule = () => {
      heartbeat = setTimeout(() => {
        renewal = (async () => {
          try {
            const now = this.now();
            const until = Math.min(now + this.leaseMs, deadline);
            if (!(await this.store.renew(key, owner, now, until))) fail();
            else if (!stopped && !controller.signal.aborted && this.now() < confirmedLeaseUntil) {
              confirmedLeaseUntil = until;
              scheduleExpiry();
            } else {
              fail();
            }
          } catch {
            fail();
          }
          if (!stopped && !heartbeatStopped && !controller.signal.aborted) schedule();
        })();
      }, this.renewMs);
    };
    const maximum = setTimeout(fail, Math.max(0, deadline - this.now()));
    scheduleExpiry();
    schedule();
    try {
      return await Promise.race([
        (async () => {
          await assertOwned();
          const result = await operation({ assertOwned, signal: controller.signal, deadline });
          // Drain the heartbeat before the final ownership check and release. The deadline also
          // covers stalled reads/renewals; late continuations fail assertOwned and cannot release.
          heartbeatStopped = true;
          clearTimeout(heartbeat);
          await renewal;
          await assertOwned();
          if (!(await this.store.release(key, owner))) throw fail();
          return result;
        })(),
        lost,
      ]);
    } finally {
      stopped = true;
      clearTimeout(heartbeat);
      clearTimeout(maximum);
      clearTimeout(expiry);
      controller.abort(new CommissioningLeaseError('lease_lost'));
    }
  }
}

/** Safe to construct before onApplicationBootstrap: repository lookup happens only when used. */
export function createWagoCommissioningLeaseService(
  context: Pick<PluginContext, 'getRepository'>,
): WagoCommissioningLeaseService {
  return new WagoCommissioningLeaseService(
    new RepositoryCommissioningLeaseStore(() => context.getRepository(WagoCommissioningLeaseEntity)),
  );
}
