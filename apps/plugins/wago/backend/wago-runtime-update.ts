import { advanceRuntimeRetry } from './wago-runtime-retry';
import { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  ManagedRuntimeUpdateHost,
  RuntimeUpdateFailure,
  RuntimeUpdateInspection,
  RuntimeUpdateRecord,
  RuntimeUpdateStore,
} from './wago-runtime-update-contracts';
import { RuntimeUpdateExisting } from './wago-runtime-update-existing';
import { active } from './wago-runtime-update.active';
import { RuntimeUpdateError } from './wago-runtime-update.errors';
import { LEASE_MS } from './wago-runtime-update.lease-ms';
import { runtimeTargetImageId } from './wago-runtime-target-image';

export class WagoRuntimeUpdateCoordinator extends RuntimeUpdateExisting {
  constructor(
    store: RuntimeUpdateStore,
    desired: () => Promise<BuildRuntimeArtifact>,
    host: ManagedRuntimeUpdateHost,
    audit: (record: Readonly<RuntimeUpdateRecord>) => Promise<void>,
    now = Date.now,
    concurrency = 2,
  ) {
    super(store, desired, host, audit, now, concurrency);
  }
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
}
export { RuntimeUpdateError } from './wago-runtime-update.errors';
export * from './wago-runtime-update-contracts';
export { runtimeTargetImageId } from './wago-runtime-target-image';
