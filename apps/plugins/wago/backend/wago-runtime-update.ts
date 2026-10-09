import { randomBytes } from 'node:crypto';
import type { BuildRuntimeArtifact } from './wago-build-runtime';

export type RuntimeUpdatePhase =
  | 'blocked'
  | 'preparing'
  | 'staging'
  | 'activating'
  | 'verifying'
  | 'accepting'
  | 'recovering'
  | 'recovery_required'
  | 'failed'
  | 'current';
export type RuntimeUpdateFailure =
  | 'management_required'
  | 'offline'
  | 'incompatible'
  | 'storage'
  | 'host_gate'
  | 'release_changed'
  | 'transfer'
  | 'transfer_size'
  | 'transfer_checksum'
  | 'transfer_timeout'
  | 'receiver_tools'
  | 'load'
  | 'readiness'
  | 'interrupted'
  | 'recovery'
  | 'host_identity'
  | 'authentication'
  | 'ssh_agent'
  | 'lock_tools'
  | 'audit'
  | 'runtime_assets'
  | 'codesys_active'
  | 'codesys_boot_enabled'
  | 'io_unavailable'
  | 'writer_conflict';

export interface RuntimeStorageDiagnostic {
  path: string;
  requiredKiB: number;
  availableKiB: number;
}

/** Public and durable metadata contains no SSH/MQTT credentials or raw transport errors. */
export interface RuntimeUpdateRecord {
  controllerId: number;
  phase: RuntimeUpdatePhase;
  token: string | null;
  desiredImageId: string;
  desiredRuntimeVersion?: string;
  /** Verified installed image; a rebuild of the same version may have a different config digest. */
  currentImageId?: string;
  previousRuntimeVersion?: string | null;
  desiredDigest: string;
  buildId: string;
  installerSha256?: string;
  previousImageId: string | null;
  attempt: number;
  startedAt: number;
  updatedAt: number;
  retryAt: number;
  failure: RuntimeUpdateFailure | null;
  /** Only validated capacity figures, never raw SSH output. */
  storageDiagnostics?: RuntimeStorageDiagnostic[];
  /** Independent cleanup backoff preserves the accepted rollout and its receipt. */
  cleanupAttempt?: number;
  cleanupRetryAt?: number;
}

export interface RuntimeUpdateStore {
  /** The same controller operation lease must serialize commissioning and management transitions. */
  acquire(controllerId: number, owner: string, now: number, until: number): Promise<boolean>;
  load(controllerId: number): Promise<RuntimeUpdateRecord | null>;
  save(record: RuntimeUpdateRecord, owner: string, now: number): Promise<void>;
  release(controllerId: number, owner: string): Promise<void>;
}

export interface RuntimeUpdateInspection {
  imageId: string;
  runtimeVersion?: string;
  /** Observed under pinned SSH, not inferred from the semver in a heartbeat. */
  managed: boolean;
  claimed: boolean;
  compatible: boolean;
  online: boolean;
}

/** Runtime releases are manually versioned. Image identity still pins transfers
 * and readiness, but rebuilding a release is not a reason to reinstall it. */
export function runtimeTargetImageId(
  desired: BuildRuntimeArtifact,
  installed: { imageId: string; runtimeVersion?: string },
): string {
  return installed.imageId && installed.runtimeVersion === desired.manifest.runtimeVersion
    ? installed.imageId
    : desired.imageId;
}

/** Privileged host transaction seam. Implementations must use a fixed scoped host
 * helper, take install.lock, verify host ownership/CODESYS/storage, retain a durable
 * token journal across reboot, and preserve runtime.env, CA and enrolled state.
 * A stage or activate retry MUST NOT delete/replace another token's journal.
 * Recovery returns only after the prior runtime passes the host gate; acceptance
 * and recovery retain idempotent receipts until server acknowledgement.
 * No method may outlive its bounded signal/deadline. No bootstrap passwords here.
 */
export interface ManagedRuntimeUpdateHost {
  inspect(controllerId: number, signal: AbortSignal): Promise<RuntimeUpdateInspection>;
  /** Publish the authenticated build installer only after durable intent and audit. */
  prepare?(controllerId: number, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  stage(controllerId: number, token: string, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  activate(controllerId: number, token: string, artifact: BuildRuntimeArtifact, signal: AbortSignal): Promise<void>;
  verify(
    controllerId: number,
    token: string | null,
    imageId: string,
    since: number,
    signal: AbortSignal,
  ): Promise<{
    imageId: string;
    /** Fresh permanent heartbeat AND readiness from the same new boot, not retained MQTT. */
    observedAt: number;
    permanent: boolean;
    ready: boolean;
  }>;
  accept(controllerId: number, token: string, signal: AbortSignal): Promise<void>;
  /** Only after the server durably recorded current; discard retained rollback data. */
  acknowledge(controllerId: number, token: string, signal: AbortSignal): Promise<void>;
  recover(controllerId: number, token: string, previousImageId: string, signal: AbortSignal): Promise<void>;
}

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

const active = new Set<RuntimeUpdatePhase>([
  'staging',
  'activating',
  'verifying',
  'accepting',
  'recovering',
  'recovery_required',
]);
const OPERATION_MS = 25 * 60_000;
const LEASE_MS = 30 * 60_000;
const CURRENT_RECHECK_MS = 5 * 60_000;

/** Durable reconciliation core. Runtime versions drive upgrades; Docker config
 * identity pins installation and verifies the running image. Rebuilds do not restart it.
 * Crash recovery precedes new work, including when the deployed build changed.
 * No controller can be considered current from a staged/loaded bundle alone.
 */
export class WagoRuntimeUpdateCoordinator {
  private readonly running = new Set<number>();
  private readonly operations = new Set<AbortController>();
  private readonly shutdownWaiters = new Set<() => void>();
  private stopped = false;

  constructor(
    private readonly store: RuntimeUpdateStore,
    private readonly desired: () => Promise<BuildRuntimeArtifact>,
    private readonly host: ManagedRuntimeUpdateHost,
    private readonly audit: (record: Readonly<RuntimeUpdateRecord>) => Promise<void>,
    private readonly now = Date.now,
    private readonly concurrency = 2,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4)
      throw new Error('Invalid update concurrency');
  }

  /** Call at startup, on desired/runtime-status changes, and on a bounded retry timer.
   * Busy work is coalesced; callers retain/paginate their inventory rather than
   * creating an unbounded in-memory queue. Retry deadlines survive server restart.
   */
  async reconcile(
    controllerId: number,
    retry = false,
    observedImageId?: string,
  ): Promise<'busy' | 'deferred' | 'settled'> {
    if (!Number.isSafeInteger(controllerId) || controllerId <= 0) throw new Error('Invalid controller ID');
    if (this.stopped || this.running.has(controllerId) || this.running.size >= this.concurrency) return 'busy';
    this.running.add(controllerId);
    const owner = randomBytes(16).toString('hex');
    const operation = new AbortController();
    this.operations.add(operation);
    const deadline = this.now() + OPERATION_MS;
    const timer = setTimeout(() => operation.abort(), OPERATION_MS).unref();
    let acquired = false;
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
    try {
      acquired = await this.store.acquire(controllerId, owner, this.now(), this.now() + LEASE_MS);
      if (!acquired) return 'busy';
      let record = await this.store.load(controllerId);
      if (
        retry &&
        record &&
        (['blocked', 'failed', 'recovery_required'].includes(record.phase) || record.cleanupRetryAt)
      ) {
        // Administrator retry only advances deadlines under the shared lease;
        // retained rollback/acceptance receipts still run before new work.
        record.retryAt = 0;
        record.cleanupRetryAt = 0;
        await persist(record);
      }
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
      if (inspection.imageId === targetImageId) {
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

  async stop(): Promise<void> {
    this.stopped = true;
    for (const operation of this.operations) operation.abort();
    // Nest must not close the store while cancelled connections are still
    // unwinding their finally blocks and releasing the device-operation lease.
    if (this.operations.size > 0) await new Promise<void>((resolve) => this.shutdownWaiters.add(resolve));
  }

  private async assertCurrent(imageId: string) {
    if ((await this.desired()).imageId !== imageId) throw new RuntimeUpdateError('release_changed');
  }

  private retryAt(attempt: number) {
    return this.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempt - 1, 6));
  }
}
