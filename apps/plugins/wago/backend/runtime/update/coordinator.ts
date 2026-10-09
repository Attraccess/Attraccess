import { randomBytes } from 'node:crypto';
import { type BuildRuntimeArtifact } from '../artifacts/build';
import { advanceRuntimeRetry } from '../retry';
import { runtimeTargetImageId } from '../target-image';
import type { RuntimeUpdatePhase } from './contracts';
import {
  ManagedRuntimeUpdateHost,
  RuntimeStorageDiagnostic,
  RuntimeUpdateFailure,
  RuntimeUpdateInspection,
  RuntimeUpdateRecord,
  RuntimeUpdateStore,
} from './contracts';

export const active = new Set<RuntimeUpdatePhase>([
  'staging',
  'activating',
  'verifying',
  'accepting',
  'recovering',
  'recovery_required',
]);

export class RuntimeUpdateError extends Error {
  constructor(
    readonly failure: RuntimeUpdateFailure,
    readonly storageDiagnostics?: RuntimeStorageDiagnostic[],
  ) {
    super(
      `CC100 runtime update failed: ${failure}. See the controller runtime status for the reason and recovery steps.`,
    );
  }
}

export const LEASE_MS = 30 * 60_000;

export const CURRENT_RECHECK_MS = 5 * 60_000;

export const OPERATION_MS = 25 * 60_000;

export * from './contracts';

export { runtimeTargetImageId } from '../target-image';

export class WagoRuntimeUpdateCoordinator {
  public constructor(
    protected readonly store: RuntimeUpdateStore,
    protected readonly desired: () => Promise<BuildRuntimeArtifact>,
    protected readonly host: ManagedRuntimeUpdateHost,
    protected readonly audit: (record: Readonly<RuntimeUpdateRecord>) => Promise<void>,
    protected readonly now = Date.now,
    protected readonly concurrency = 2,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4)
      throw new Error('Invalid update concurrency');
  }

  protected readonly running = new Set<number>();

  protected readonly operations = new Set<AbortController>();

  protected readonly shutdownWaiters = new Set<() => void>();

  protected stopped = false;

  /** Coalesce startup, status-change and retry work; callers retain/paginate inventory.
   * Concurrency is bounded and retry deadlines survive restarts. */
  async reconcile(
    controllerId: number,
    retry = false,
    observedImageId?: string,
  ): Promise<'busy' | 'deferred' | 'settled'> {
    if (!Number.isSafeInteger(controllerId) || controllerId <= 0) throw new Error('Invalid controller ID');
    if (this.stopped || this.running.has(controllerId) || this.running.size >= this.concurrency) return 'busy';
    this.running.add(controllerId);
    let acquired = false;
    const { owner, operation, timer, assertOwned, persist, acknowledge } = this.createLease(controllerId);
    try {
      acquired = await this.store.acquire(controllerId, owner, this.now(), this.now() + LEASE_MS);
      if (!acquired) return 'busy';
      let record = await this.store.load(controllerId);
      await advanceRuntimeRetry(record, retry, persist);
      if (record && ['current', 'failed'].includes(record.phase) && record.token) {
        if (!(await acknowledge(record))) return 'deferred';
      }
      if (record && active.has(record.phase)) {
        if (record.phase === 'recovery_required' && record.retryAt > this.now()) return 'deferred';
        // Do not guess whether an interrupted accept succeeded. The host's
        // idempotent receipt/journal decides whether rollback is still available.
        if (!record.token || !record.previousImageId) throw new RuntimeUpdateError('recovery');
        record.phase = 'recovering';
        await persist(record);
        try {
          await this.host.recover(controllerId, record.token, record.previousImageId, operation.signal);
          assertOwned();
        } catch {
          record.phase = 'recovery_required';
          record.failure = 'recovery';
          record.retryAt = this.now() + 60_000;
          await persist(record);
          return 'settled';
        }
        record.phase = 'failed';
        record.failure = 'interrupted';
        record.retryAt = this.now();
        await persist(record);
        if (!(await acknowledge(record))) return 'deferred';
        // Recovery and supervisor handoff can consume most of an operation's
        // deadline. Release the lease here; the next automatic scan starts the
        // new rollout with its own full budget and the acknowledged journal gone.
        return 'settled';
      }
      const desired = await this.desired();
      assertOwned();
      const contradictedCurrent =
        record?.phase === 'current' &&
        observedImageId !== undefined &&
        observedImageId !== (record.currentImageId ?? record.desiredImageId);
      if (record && !contradictedCurrent && record.desiredImageId === desired.imageId && record.retryAt > this.now())
        return 'deferred';
      const attempt = (record?.desiredImageId === desired.imageId ? record.attempt : 0) + 1;
      let inspection: RuntimeUpdateInspection;
      try {
        inspection = await this.host.inspect(controllerId, operation.signal);
        assertOwned();
      } catch (error) {
        await persist({
          controllerId,
          phase: 'blocked',
          token: null,
          desiredImageId: desired.imageId,
          desiredRuntimeVersion: desired.manifest.runtimeVersion,
          previousRuntimeVersion:
            record?.desiredImageId === desired.imageId ? (record.previousRuntimeVersion ?? null) : null,
          desiredDigest: desired.digest,
          buildId: desired.buildId,
          previousImageId: record?.desiredImageId === desired.imageId ? record.previousImageId : null,
          attempt,
          startedAt: this.now(),
          updatedAt: this.now(),
          retryAt: this.retryAt(attempt),
          failure: error instanceof RuntimeUpdateError ? error.failure : 'offline',
        });
        return 'settled';
      }
      const previous = record;
      const retainPrevious = previous?.desiredImageId === desired.imageId && inspection.imageId === desired.imageId;
      record = {
        controllerId,
        phase: 'blocked',
        token: null,
        desiredImageId: desired.imageId,
        desiredRuntimeVersion: desired.manifest.runtimeVersion,
        previousRuntimeVersion: retainPrevious
          ? (previous.previousRuntimeVersion ?? inspection.runtimeVersion ?? null)
          : (inspection.runtimeVersion ?? null),
        desiredDigest: desired.digest,
        buildId: desired.buildId,
        ...(desired.installerSha256 ? { installerSha256: desired.installerSha256 } : {}),
        previousImageId: retainPrevious ? (previous.previousImageId ?? inspection.imageId) : inspection.imageId,
        attempt,
        startedAt: this.now(),
        updatedAt: this.now(),
        retryAt: 0,
        failure: null,
        cleanupAttempt: 0,
        cleanupRetryAt: 0,
      };
      // A claimed identity is mandatory even when the Docker image is already current.
      const blocker: RuntimeUpdateFailure | null =
        !inspection.claimed || !inspection.managed
          ? 'management_required'
          : !inspection.online
            ? 'offline'
            : !inspection.compatible
              ? 'incompatible'
              : null;
      if (blocker) {
        record.failure = blocker;
        record.retryAt = this.retryAt(attempt);
        await persist(record);
        return 'settled';
      }
      if (this.host.prepare) {
        record.phase = 'preparing';
        await persist(record);
        try {
          await this.host.prepare(controllerId, desired, operation.signal);
          await this.assertCurrent(desired.imageId);
          assertOwned();
        } catch (error) {
          assertOwned();
          record.phase = 'blocked';
          record.failure = error instanceof RuntimeUpdateError ? error.failure : 'incompatible';
          record.retryAt = this.retryAt(attempt);
          await persist(record);
          return 'settled';
        }
      }
      const targetImageId = runtimeTargetImageId(desired, inspection);
      if (inspection.imageId === targetImageId)
        return await this.verifyExisting(
          controllerId,
          desired,
          record,
          operation,
          assertOwned,
          persist,
          attempt,
          targetImageId,
        );
      return await this.applyRollout(
        controllerId,
        desired,
        record,
        inspection,
        operation,
        assertOwned,
        persist,
        acknowledge,
        attempt,
      );
    } finally {
      clearTimeout(timer);
      operation.abort();
      if (acquired) await this.store.release(controllerId, owner).catch(() => undefined);
      this.running.delete(controllerId);
      this.operations.delete(operation);
      if (this.operations.size === 0) {
        for (const resolve of this.shutdownWaiters) resolve();
        this.shutdownWaiters.clear();
      }
    }
  }

  protected async verifyExisting(
    controllerId: number,
    desired: BuildRuntimeArtifact,
    record: RuntimeUpdateRecord,
    operation: AbortController,
    assertOwned: () => void,
    persist: (record: RuntimeUpdateRecord) => Promise<void>,
    attempt: number,
    targetImageId: string,
  ): Promise<'settled'> {
    // Read-only proof permits the existing boot, but requires a recent
    // permanent heartbeat and matching readiness. No restart or staging.
    const since = record.startedAt;
    try {
      const proof = await this.host.verify(controllerId, null, targetImageId, since, operation.signal);
      if (
        !proof.permanent ||
        !proof.ready ||
        proof.imageId !== targetImageId ||
        !Number.isSafeInteger(proof.observedAt) ||
        proof.observedAt <= since ||
        proof.observedAt > this.now()
      )
        throw new RuntimeUpdateError('readiness');
      await this.assertCurrent(desired.imageId);
    } catch (error) {
      assertOwned();
      record.phase = 'blocked';
      record.failure = error instanceof RuntimeUpdateError ? error.failure : 'readiness';
      record.retryAt = this.retryAt(attempt);
      await persist(record);
      return 'settled';
    }
    record.phase = 'current';
    record.currentImageId = targetImageId;
    record.attempt = 0;
    record.retryAt = this.now() + CURRENT_RECHECK_MS;
    await persist(record);
    return 'settled';
  }

  protected async applyRollout(
    controllerId: number,
    desired: BuildRuntimeArtifact,
    record: RuntimeUpdateRecord,
    inspection: RuntimeUpdateInspection,
    operation: AbortController,
    assertOwned: () => void,
    persist: (record: RuntimeUpdateRecord) => Promise<void>,
    acknowledge: (record: RuntimeUpdateRecord) => Promise<boolean>,
    attempt: number,
  ): Promise<'deferred' | 'settled'> {
    record.token = randomBytes(16).toString('hex');
    const token = record.token;
    const previousImageId = inspection.imageId;
    try {
      record.phase = 'staging';
      await persist(record);
      await this.host.stage(controllerId, record.token, desired, operation.signal);
      await this.assertCurrent(desired.imageId);
      record.phase = 'activating';
      await persist(record);
      await this.host.activate(controllerId, record.token, desired, operation.signal);
      record.phase = 'verifying';
      await persist(record);
      const proof = await this.host.verify(
        controllerId,
        record.token,
        desired.imageId,
        record.startedAt,
        operation.signal,
      );
      if (
        !proof.permanent ||
        !proof.ready ||
        proof.imageId !== desired.imageId ||
        !Number.isSafeInteger(proof.observedAt) ||
        proof.observedAt <= record.startedAt ||
        proof.observedAt > this.now()
      ) {
        throw new RuntimeUpdateError('readiness');
      }
      await this.assertCurrent(desired.imageId);
      record.phase = 'accepting';
      await persist(record);
      await this.host.accept(controllerId, record.token, operation.signal);
      record.phase = 'current';
      record.currentImageId = desired.imageId;
      record.attempt = 0;
      record.retryAt = this.now() + CURRENT_RECHECK_MS;
      await persist(record);
      // This last cleanup cannot turn a durably accepted rollout into a failed
      // rollout. If interrupted, the next owner retries acknowledgement only.
      if (!(await acknowledge(record))) return 'deferred';
    } catch (error) {
      if (record.phase === 'current') throw error;
      // Never roll back after losing the lease/deadline. Leave the durable token
      // for a later owner and the independently running host watchdog.
      assertOwned();
      record.failure = error instanceof RuntimeUpdateError ? error.failure : 'interrupted';
      if (error instanceof RuntimeUpdateError && error.storageDiagnostics?.length)
        record.storageDiagnostics = error.storageDiagnostics;
      record.phase = 'recovering';
      await persist(record);
      try {
        await this.host.recover(controllerId, token, previousImageId, operation.signal);
        record.phase = 'failed';
      } catch {
        record.phase = 'recovery_required';
        record.failure = 'recovery';
      }
      record.retryAt = this.retryAt(attempt);
      await persist(record);
      if (record.phase === 'failed') {
        if (!(await acknowledge(record))) return 'deferred';
      }
    }
    return 'settled';
  }

  protected createLease(controllerId: number) {
    const owner = randomBytes(16).toString('hex');
    const operation = new AbortController();
    this.operations.add(operation);
    const deadline = this.now() + OPERATION_MS;
    const timer = setTimeout(() => operation.abort(), OPERATION_MS).unref();
    const assertOwned = () => {
      if (this.stopped || operation.signal.aborted || this.now() >= deadline)
        throw new RuntimeUpdateError('interrupted');
    };
    const persist = async (record: RuntimeUpdateRecord) => {
      assertOwned();
      record.updatedAt = this.now();
      await this.store.save(record, owner, this.now());
      // Persist intent before audit and before any remote mutation. An audit failure
      // leaves recoverable intent; raw errors never enter public diagnostics.
      await this.audit(Object.freeze({ ...record }));
      assertOwned();
    };
    const acknowledge = async (record: RuntimeUpdateRecord): Promise<boolean> => {
      if (!record.token) return true;
      if ((record.cleanupRetryAt ?? 0) > this.now()) return false;
      try {
        await this.host.acknowledge(controllerId, record.token, operation.signal);
        assertOwned();
      } catch {
        assertOwned();
        record.cleanupAttempt = (record.cleanupAttempt ?? 0) + 1;
        record.cleanupRetryAt = this.retryAt(record.cleanupAttempt);
        await persist(record);
        return false;
      }
      record.token = null;
      record.cleanupAttempt = 0;
      record.cleanupRetryAt = 0;
      await persist(record);
      return true;
    };

    return { owner, operation, timer, assertOwned, persist, acknowledge };
  }

  protected retryAt(attempt: number) {
    return this.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempt - 1, 6));
  }

  protected async assertCurrent(imageId: string) {
    if ((await this.desired()).imageId !== imageId) throw new RuntimeUpdateError('release_changed');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const operation of this.operations) operation.abort();
    // Nest must not close the store while cancelled connections are still
    // unwinding their finally blocks and releasing the device-operation lease.
    if (this.operations.size > 0) await new Promise<void>((resolve) => this.shutdownWaiters.add(resolve));
  }
}
