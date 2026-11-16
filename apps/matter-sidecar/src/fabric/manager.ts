import { STORAGE_SCHEMA_VERSION, type BackupHeader } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { ApiError } from '../api-error';
import type { Logger } from '../logger';
import { MatterController, type ControllerOptions } from './controller';
import { freshProgress, RestoreSwap, type SwapProgress } from './restore-swap';
import { packSnapshot, unpackStage, type StageSummary } from './snapshot';
import {
  ensureStorageDir,
  fabricStatusOf,
  hardenStorage,
  inspectStorage,
  layoutFor,
  writeMetadata,
  type FabricStatus,
  type StorageInspection,
  type StorageLayout,
  type StorageMetadata,
} from './storage';

export type { FabricStatus };

export type FabricManagerOptions = {
  storageDir: string;
  matterPort: number;
  versions: { sidecar: string; matterJs: string };
  logger: Logger;
  /** Publishes `fabric.changed` after a change of the fabric identity. */
  onFabricChanged: (payload: {
    fabricGeneration: number;
    fabricId: string | null;
    state: FabricStatus['state'];
  }) => void;
  now?: () => Date;
  /** How long a stage stays usable before its keys are removed from disk. */
  stageTtlMs?: number;
  /** How long a committed restore waits for finalize or rollback before its rollback copy is quarantined. */
  pendingTtlMs?: number;
  /** Test seam: builds the matter.js controller. */
  createController?: (options: ControllerOptions) => MatterController;
};

const STAGE_TTL_MS = 15 * 60_000;
const PENDING_TTL_MS = 15 * 60_000;
/** Timer-driven clean-up waits this long when another operation holds the single-flight gate. */
const HOUSEKEEPING_RETRY_MS = 1_000;
const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

type Staged = { stageId: string; header: BackupHeader; directory: string; expiresAt: number; timer: NodeJS.Timeout };
type PendingFinalize = {
  stageId: string;
  previous: StorageInspection;
  /** The generation the restore announced; whatever comes next must be newer. */
  generation: number;
  quarantined?: string;
  timer: NodeJS.Timeout;
};
type RestoreResult = { state: 'committed' | 'rolled_back' | 'finalized' | 'aborted'; fabric: FabricStatus };

/** The plugin has already been told `timeout`, so a commit whose deadline passed must not change anything. */
function refuseIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new ApiError('timeout', 'The request deadline passed before the restore started. Nothing was changed.');
  }
}

/**
 * Owns the sidecar's persistent state: the fabric (a matter.js controller storage plus a metadata file) and the
 * two-phase restore. At most one fabric-mutating or snapshotting operation runs at a time. Nothing here creates a fabric
 * unless an administrator-driven `create` or `commit` asks for it.
 */
export class FabricManager {
  readonly layout: StorageLayout;
  readonly #swap: RestoreSwap;
  #inspection: StorageInspection = { kind: 'uninitialized' };
  #controller: MatterController | undefined;
  /** The operation holding the single-flight gate. */
  #running: Promise<unknown> | undefined;
  #closed = false;
  #staged: Staged | undefined;
  #pending: PendingFinalize | undefined;

  constructor(private readonly options: FabricManagerOptions) {
    this.layout = layoutFor(options.storageDir);
    this.#swap = new RestoreSwap({
      layout: this.layout,
      logger: options.logger,
      sidecarVersion: options.versions.sidecar,
      now: () => this.now(),
    });
  }

  /** The running controller, for the test-only commissioning harness. */
  get controller(): MatterController | undefined {
    return this.#controller;
  }

  private now() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  /** Inspects the storage and, when a complete fabric exists, resumes the controller. Never creates a fabric. */
  async init(): Promise<void> {
    ensureStorageDir(this.options.storageDir);
    // A stage is only kept in memory, so one found on disk belongs to a process that is gone. It holds a full copy of
    // the staged fabric keys, so it is not left behind.
    rmSync(this.layout.stagingDir, { recursive: true, force: true });
    this.#inspection = inspectStorage(this.layout);
    if (this.#inspection.kind === 'initialized') {
      hardenStorage(this.options.storageDir);
      await this.#resume(this.#inspection);
      hardenStorage(this.options.storageDir);
    }
    if (this.#swap.settleLeftover(this.#inspection.kind === 'initialized')) {
      this.#inspection = { kind: 'recovery', reason: 'restore_interrupted' };
    }
    if (this.#inspection.kind === 'recovery') {
      this.options.logger('warn', 'matter storage needs recovery; the controller is not started', {
        reason: this.#inspection.reason,
      });
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearTimeout(this.#staged?.timer);
    clearTimeout(this.#pending?.timer);
    // An operation in progress finishes first: stopping it halfway would leave the storage half-swapped, and the
    // controller it may start is stopped below.
    await this.#running?.catch(() => undefined);
    await this.#stopController();
  }

  status(): FabricStatus {
    return fabricStatusOf(this.#inspection);
  }

  // --- single-flight gate ---------------------------------------------------------------------

  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closed) throw new ApiError('sidecar_unavailable', 'The Matter sidecar is shutting down.');
    if (this.#running) {
      throw new ApiError('busy', 'A snapshot or restore is in progress. Try again in a moment.');
    }
    const running = work();
    this.#running = running;
    try {
      return await running;
    } finally {
      this.#running = undefined;
    }
  }

  /** Runs timer-driven clean-up through the single-flight gate, waiting while another operation holds it. */
  #housekeeping(work: () => void): void {
    if (this.#closed) return;
    this.#exclusive(async () => work()).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'busy') {
        setTimeout(() => this.#housekeeping(work), HOUSEKEEPING_RETRY_MS).unref();
        return;
      }
      this.options.logger('error', 'a restore clean-up failed', { error: errorName(error) });
    });
  }

  // --- controller lifecycle ---------------------------------------------------------------------

  async #resume(inspection: Extract<StorageInspection, { kind: 'initialized' }>): Promise<void> {
    const controller = this.#newController(inspection.metadata.nodeIdFloor);
    try {
      await controller.start();
      const loaded = await controller.loadedFacts();
      if (
        loaded?.fabricId !== inspection.facts.fabricId ||
        loaded.rootCertFingerprint !== inspection.facts.rootCertFingerprint
      ) {
        throw new Error('The fabric matter.js loaded is not the recorded fabric.');
      }
      this.#controller = controller;
    } catch (error) {
      await controller.stop().catch(() => undefined);
      this.options.logger('error', 'the Matter controller could not resume; storage needs recovery', {
        error: errorName(error),
      });
      this.#inspection = { kind: 'recovery', reason: 'storage_corrupt' };
    }
  }

  #newController(nodeIdFloor?: number): MatterController {
    const options: ControllerOptions = { layout: this.layout, nodeIdFloor, port: this.options.matterPort };
    return this.options.createController?.(options) ?? new MatterController(options);
  }

  async #stopController(): Promise<void> {
    const controller = this.#controller;
    this.#controller = undefined;
    await controller?.stop();
  }

  #announce() {
    const status = this.status();
    this.options.onFabricChanged({
      fabricGeneration: status.fabricGeneration,
      fabricId: status.fabricId,
      state: status.state,
    });
  }

  // --- fabric.create ---------------------------------------------------------------------------

  create(label: string): Promise<FabricStatus> {
    return this.#exclusive(async () => {
      if (this.#inspection.kind === 'recovery') {
        throw new ApiError('recovery_required', 'The Matter storage needs recovery; a fabric cannot be created.', {
          reason: this.#inspection.reason,
        });
      }
      if (this.#inspection.kind === 'initialized') {
        throw new ApiError('fabric_exists', 'A fabric already exists. Restore a backup to replace it.');
      }
      const controller = this.#newController();
      try {
        await controller.start();
        const facts = await controller.createFabric(label);
        const stamp = this.now();
        const metadata: StorageMetadata = {
          storageSchemaVersion: STORAGE_SCHEMA_VERSION,
          storageInstanceId: randomUUID(),
          writtenBySidecar: this.options.versions.sidecar,
          fabricGeneration: 1,
          ...facts,
          createdAt: stamp,
          updatedAt: stamp,
        };
        writeMetadata(this.layout, metadata);
        hardenStorage(this.options.storageDir);
        this.#controller = controller;
        this.#inspection = { kind: 'initialized', metadata, facts };
      } catch (error) {
        await controller.stop().catch(() => undefined);
        // The storage was empty before, so removing what this attempt wrote restores it exactly.
        rmSync(this.layout.matterDir, { recursive: true, force: true });
        rmSync(this.layout.metadataFile, { force: true });
        this.options.logger('error', 'the fabric could not be created', { error: errorName(error) });
        throw new ApiError('internal_error', 'The fabric could not be created. No state was changed.');
      }
      this.#announce();
      return this.status();
    });
  }

  // --- backup.snapshot -------------------------------------------------------------------------

  snapshot(): Promise<{ header: BackupHeader; payload: string }> {
    return this.#exclusive(async () => {
      const inspection = this.#inspection;
      if (inspection.kind === 'recovery') {
        throw new ApiError('recovery_required', 'The Matter storage needs recovery; it cannot be backed up.', {
          reason: inspection.reason,
        });
      }
      if (inspection.kind === 'uninitialized') {
        throw new ApiError('fabric_absent', 'There is no fabric to back up.');
      }
      const wasRunning = this.#controller !== undefined;
      // matter.js writes while it runs, so the files are only copied once the controller is closed.
      await this.#stopController();
      try {
        const current = inspectStorage(this.layout);
        if (current.kind !== 'initialized')
          throw new ApiError('internal_error', 'The Matter storage changed unexpectedly.');
        return packSnapshot(this.layout, current, this.options.versions, this.now());
      } finally {
        if (wasRunning) await this.#restart();
      }
    });
  }

  /** Brings the controller back after a snapshot, with the same checks as a start-up. */
  async #restart(): Promise<void> {
    if (this.#inspection.kind !== 'initialized') return;
    await this.#resume(this.#inspection);
    if (this.status().state === 'recovery_required') this.#announce();
  }

  // --- restore ---------------------------------------------------------------------------------

  stage(header: BackupHeader, payload: string): Promise<StageSummary> {
    return this.#exclusive(async () => {
      this.#discardStaged();
      const { stageId, directory } = unpackStage(this.layout, header, payload, this.options.versions.matterJs);
      const ttl = this.options.stageTtlMs ?? STAGE_TTL_MS;
      const expiresAt = Date.now() + ttl;
      // The stage holds the fabric keys, so it is removed when it expires, not only on its next use.
      const timer = setTimeout(() => this.#housekeeping(() => this.#expireStage(stageId)), ttl).unref();
      this.#staged = { stageId, header, directory, expiresAt, timer };
      return {
        stageId,
        fabricId: header.fabricId,
        rootCertFingerprint: header.rootCertFingerprint,
        fabricGeneration: header.fabricGeneration,
        storageInstanceId: header.storageInstanceId,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    });
  }

  #discardStaged() {
    const staged = this.#staged;
    this.#staged = undefined;
    clearTimeout(staged?.timer);
    if (staged) rmSync(staged.directory, { recursive: true, force: true });
    rmSync(this.layout.stagingDir, { recursive: true, force: true });
  }

  #expireStage(stageId: string) {
    if (this.#staged?.stageId === stageId) this.#discardStaged();
  }

  #requireStaged(stageId: string): Staged {
    const staged = this.#staged;
    if (!staged || staged.stageId !== stageId)
      throw new ApiError('not_found', 'Unknown or already used restore stage.');
    if (Date.now() > staged.expiresAt) {
      this.#discardStaged();
      throw new ApiError('not_found', 'The restore stage expired. Validate the backup again.');
    }
    return staged;
  }

  commit(stageId: string, signal?: AbortSignal): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      const staged = this.#requireStaged(stageId);
      refuseIfAborted(signal);
      const previous = this.#inspection;
      const progress = freshProgress();
      try {
        await this.#stopController();
        refuseIfAborted(signal);
        this.#swap.quarantineEarlier(progress, previous);
        // An earlier restore that was never finalized counts as finalized now: its rollback copy is in quarantine.
        this.#clearPending();
        this.#swap.createRollback(progress);
        this.#swap.moveLiveAside(progress, previous.kind, stageId);
        await this.#installStaged(staged, previous, progress);
      } catch (error) {
        return this.#failCommit(error, progress, previous);
      }
      this.#setPending(stageId, previous, progress.quarantined);
      this.#discardStaged();
      this.#announce();
      return { state: 'committed', fabric: this.status() };
    });
  }

  /** Undoes a failed commit and tells the plugin what state the storage is really in. */
  async #failCommit(error: unknown, progress: SwapProgress, previous: StorageInspection): Promise<never> {
    const intact = await this.#swapBack(progress, previous);
    this.#discardStaged();
    this.options.logger('error', 'the restore failed and was undone', { error: errorName(error), intact });
    if (!intact) {
      throw this.#recoveryError('The restore failed and the previous Matter storage could not be brought back intact.');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('restore_failed', 'The restore failed and the previous Matter storage was put back.');
  }

  /** The storage ended up in a recovery state it was not in before: announced, and reported as such. */
  #recoveryError(message: string): ApiError {
    this.#announce();
    const reason = this.#inspection.kind === 'recovery' ? this.#inspection.reason : null;
    return new ApiError('recovery_required', `${message} The Matter storage needs recovery.`, { reason });
  }

  async #installStaged(staged: Staged, previous: StorageInspection, progress: SwapProgress): Promise<void> {
    const { metadata, facts } = this.#swap.install(staged.directory, previous, progress);
    const controller = this.#newController(metadata.nodeIdFloor);
    try {
      await controller.start();
      const loaded = await controller.loadedFacts();
      const { header } = staged;
      if (
        loaded?.fabricId !== header.fabricId ||
        loaded.rootCertFingerprint !== header.rootCertFingerprint ||
        facts.fabricId !== header.fabricId
      ) {
        throw new Error('verification failed');
      }
    } catch (error) {
      await controller.stop().catch(() => undefined);
      throw error;
    }
    this.#controller = controller;
    this.#inspection = { kind: 'initialized', metadata, facts };
  }

  /**
   * Undoes a restore: removes only the storage installed from the stage, puts back only what was moved aside, then
   * resumes if that storage is healthy. A recovery state that was there before stays, with its reason, unless a
   * healthy fabric came back. Returns false when the storage ended up in a recovery state it was not in before.
   */
  async #swapBack(progress: SwapProgress, previous: StorageInspection): Promise<boolean> {
    await this.#stopController().catch(() => undefined);
    try {
      this.#swap.putBack(progress);
    } catch (error) {
      // Part of the previous storage is still in the rollback copy: neither copy is complete, an administrator decides.
      this.options.logger('error', 'the previous Matter storage could not be put back', { error: errorName(error) });
      this.#inspection = { kind: 'recovery', reason: 'restore_interrupted' };
      return false;
    }
    this.#inspection = inspectStorage(this.layout);
    if (this.#inspection.kind === 'initialized') await this.#resume(this.#inspection);
    if (previous.kind !== 'recovery') return this.#inspection.kind !== 'recovery';
    if (this.#inspection.kind !== 'initialized') this.#inspection = previous;
    return true;
  }

  #setPending(stageId: string, previous: StorageInspection, quarantined: string | undefined) {
    const ttl = this.options.pendingTtlMs ?? PENDING_TTL_MS;
    const timer = setTimeout(() => this.#housekeeping(() => this.#expirePending(stageId)), ttl).unref();
    this.#pending = { stageId, previous, generation: this.status().fabricGeneration, quarantined, timer };
  }

  #clearPending() {
    clearTimeout(this.#pending?.timer);
    this.#pending = undefined;
  }

  /** Neither finalize nor rollback arrived in time: the rollback copy goes to quarantine instead of staying live. */
  #expirePending(stageId: string) {
    if (this.#pending?.stageId !== stageId) return;
    this.#clearPending();
    if (this.#swap.exists()) {
      this.#swap.quarantine('a restore was neither finalized nor rolled back in time; its rollback copy was moved');
    }
  }

  rollback(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      const pending = this.#pending;
      if (pending?.stageId !== stageId) throw new ApiError('not_found', 'There is no restore to roll back.');
      this.#swap.raiseSavedGeneration(pending.previous, pending.generation + 1);
      this.#clearPending();
      const progress = this.#swap.committedProgress(pending.quarantined);
      if (!(await this.#swapBack(progress, pending.previous))) {
        throw this.#recoveryError('The rollback could not bring the previous Matter storage back intact.');
      }
      this.#announce();
      return { state: 'rolled_back', fabric: this.status() };
    });
  }

  finalize(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      const pending = this.#pending;
      if (pending?.stageId !== stageId) throw new ApiError('not_found', 'There is no restore to finalize.');
      this.#swap.release(pending.previous);
      this.#clearPending();
      return { state: 'finalized', fabric: this.status() };
    });
  }

  abort(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      if (this.#staged?.stageId === stageId) this.#discardStaged();
      return { state: 'aborted', fabric: this.status() };
    });
  }
}
