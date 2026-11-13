import { STORAGE_SCHEMA_VERSION, type BackupHeader, type fabricStatusSchema } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '../api-error';
import type { Logger } from '../logger';
import { ArchiveError, packDirectory, sha256Hex, unpackInto } from './archive';
import { MatterController } from './controller';
import {
  advanceRestoredCounters,
  ensureStorageDir,
  hardenStorage,
  inspectStorage,
  layoutFor,
  metadataSchema,
  readFabricFacts,
  writeMetadata,
  type FabricFacts,
  type StorageInspection,
  type StorageLayout,
  type StorageMetadata,
} from './storage';

export type FabricStatus = z.infer<typeof fabricStatusSchema>;

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
};

const STAGE_TTL_MS = 15 * 60_000;
const matterMinor = (version: string) => version.split('.').slice(0, 2).join('.');

type Staged = { stageId: string; header: BackupHeader; directory: string; expiresAt: number };
type PendingFinalize = { stageId: string; previous: StorageInspection['kind'] };
type RestoreResult = { state: 'committed' | 'rolled_back' | 'finalized' | 'aborted'; fabric: FabricStatus };

/**
 * Owns the sidecar's persistent state: the fabric (a matter.js controller storage plus a metadata file) and the
 * two-phase restore. At most one fabric-mutating or snapshotting operation runs at a time. Nothing here creates a fabric
 * unless an administrator-driven `create` or `commit` asks for it.
 */
export class FabricManager {
  readonly layout: StorageLayout;
  #inspection: StorageInspection = { kind: 'uninitialized' };
  #controller: MatterController | undefined;
  #busy = false;
  #staged: Staged | undefined;
  #pending: PendingFinalize | undefined;

  constructor(private readonly options: FabricManagerOptions) {
    this.layout = layoutFor(options.storageDir);
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
    if (this.#inspection.kind === 'recovery') {
      this.options.logger('warn', 'matter storage needs recovery; the controller is not started', {
        reason: this.#inspection.reason,
      });
      return;
    }
    if (this.#inspection.kind === 'initialized') {
      hardenStorage(this.options.storageDir);
      await this.#resume(this.#inspection);
      hardenStorage(this.options.storageDir);
    }
  }

  async close(): Promise<void> {
    const controller = this.#controller;
    this.#controller = undefined;
    await controller?.stop();
  }

  status(): FabricStatus {
    const inspection = this.#inspection;
    const base = {
      storageSchemaVersion: STORAGE_SCHEMA_VERSION as 1,
      reason: null,
      fabricId: null,
      fabricGeneration: 0,
      rootCertFingerprint: null,
      storageInstanceId: null,
    };
    if (inspection.kind === 'uninitialized') return { ...base, state: 'uninitialized' };
    if (inspection.kind === 'recovery') return { ...base, state: 'recovery_required', reason: inspection.reason };
    const { metadata } = inspection;
    return {
      ...base,
      state: 'initialized',
      fabricId: metadata.fabricId,
      fabricGeneration: metadata.fabricGeneration,
      rootCertFingerprint: metadata.rootCertFingerprint,
      storageInstanceId: metadata.storageInstanceId,
    };
  }

  // --- single-flight gate ---------------------------------------------------------------------

  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#busy) {
      throw new ApiError('busy', 'A snapshot or restore is in progress. Try again in a moment.');
    }
    this.#busy = true;
    try {
      return await work();
    } finally {
      this.#busy = false;
    }
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
        error: error instanceof Error ? error.name : 'unknown',
      });
      this.#inspection = { kind: 'recovery', reason: 'storage_corrupt' };
    }
  }

  #newController(nodeIdFloor?: number): MatterController {
    return new MatterController({ layout: this.layout, nodeIdFloor, port: this.options.matterPort });
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
        this.options.logger('error', 'the fabric could not be created', {
          error: error instanceof Error ? error.name : 'unknown',
        });
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
      await this.#controller?.stop();
      this.#controller = undefined;
      try {
        const current = inspectStorage(this.layout);
        if (current.kind !== 'initialized')
          throw new ApiError('internal_error', 'The Matter storage changed unexpectedly.');
        const archive = packDirectory(this.layout.root, ['matter', 'sidecar-metadata.json']);
        const { metadata } = current;
        const header: BackupHeader = {
          storageSchemaVersion: metadata.storageSchemaVersion,
          sidecarVersion: this.options.versions.sidecar,
          matterJsVersion: this.options.versions.matterJs,
          fabricId: metadata.fabricId,
          rootCertFingerprint: metadata.rootCertFingerprint,
          fabricGeneration: metadata.fabricGeneration,
          storageInstanceId: metadata.storageInstanceId,
          payloadSha256: sha256Hex(archive),
          payloadBytes: archive.length,
          createdAt: this.now(),
        };
        return { header, payload: archive.toString('base64') };
      } finally {
        if (wasRunning) await this.#restart();
      }
    });
  }

  async #restart(): Promise<void> {
    if (this.#inspection.kind !== 'initialized') return;
    const controller = this.#newController(this.#inspection.metadata.nodeIdFloor);
    try {
      await controller.start();
      this.#controller = controller;
    } catch (error) {
      await controller.stop().catch(() => undefined);
      this.options.logger('error', 'the Matter controller could not be restarted', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  // --- restore ---------------------------------------------------------------------------------

  stage(
    header: BackupHeader,
    payload: string,
  ): Promise<{
    stageId: string;
    fabricId: string;
    rootCertFingerprint: string;
    fabricGeneration: number;
    storageInstanceId: string;
    expiresAt: string;
  }> {
    return this.#exclusive(async () => {
      this.#discardStaged();
      const invalid = (message: string, code: string) => new ApiError('invalid_backup', message, { code });
      if (header.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
        throw invalid('The backup uses a different storage schema version.', 'incompatible_schema');
      }
      if (matterMinor(header.matterJsVersion) !== matterMinor(this.options.versions.matterJs)) {
        throw invalid('The backup was made with an incompatible matter.js release.', 'incompatible_matter_js');
      }
      const bytes = Buffer.from(payload, 'base64');
      if (bytes.length !== header.payloadBytes || sha256Hex(bytes) !== header.payloadSha256) {
        throw invalid('The snapshot is corrupt or incomplete.', 'corrupt');
      }
      const stageId = randomUUID();
      const directory = join(this.layout.stagingDir, stageId);
      try {
        mkdirSync(this.layout.stagingDir, { recursive: true, mode: 0o700 });
        unpackInto(bytes, directory);
        this.#checkStaged(directory, header);
      } catch (error) {
        // Any earlier stage was discarded above, so nothing else lives in the staging area.
        rmSync(this.layout.stagingDir, { recursive: true, force: true });
        if (error instanceof ApiError) throw error;
        throw invalid(
          error instanceof ArchiveError ? error.message : 'The snapshot is corrupt or incomplete.',
          'corrupt',
        );
      }
      const expiresAt = Date.now() + STAGE_TTL_MS;
      this.#staged = { stageId, header, directory, expiresAt };
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

  /** The unpacked snapshot must really contain the fabric its header claims. */
  #checkStaged(directory: string, header: BackupHeader) {
    const corrupt = () =>
      new ApiError('invalid_backup', 'The snapshot content does not match its header.', { code: 'corrupt' });
    const layout = layoutFor(directory);
    let metadata: StorageMetadata;
    try {
      const parsed = metadataSchema.safeParse(JSON.parse(readFileSync(layout.metadataFile, 'utf8')));
      if (!parsed.success) throw corrupt();
      metadata = parsed.data;
    } catch {
      throw corrupt();
    }
    if (metadata.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) {
      throw new ApiError('invalid_backup', 'The backup uses a different storage schema version.', {
        code: 'incompatible_schema',
      });
    }
    let facts: FabricFacts;
    try {
      facts = readFabricFacts(layout.controllerDir);
    } catch {
      throw corrupt();
    }
    if (
      facts.fabricId !== header.fabricId ||
      facts.rootCertFingerprint !== header.rootCertFingerprint ||
      metadata.fabricId !== header.fabricId ||
      metadata.rootCertFingerprint !== header.rootCertFingerprint ||
      metadata.fabricGeneration !== header.fabricGeneration ||
      metadata.storageInstanceId !== header.storageInstanceId
    ) {
      throw corrupt();
    }
  }

  #discardStaged() {
    const staged = this.#staged;
    this.#staged = undefined;
    if (staged) rmSync(staged.directory, { recursive: true, force: true });
    rmSync(this.layout.stagingDir, { recursive: true, force: true });
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

  commit(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      const staged = this.#requireStaged(stageId);
      const previous = this.#inspection;
      const previousGeneration = previous.kind === 'initialized' ? previous.metadata.fabricGeneration : 0;
      const previousFloor = previous.kind === 'initialized' ? (previous.metadata.nodeIdFloor ?? 1) : 1;
      const layout = this.layout;
      await this.#controller?.stop();
      this.#controller = undefined;
      // The previous storage is moved, never deleted: it is the rollback copy until the plugin has committed too.
      rmSync(layout.rollbackDir, { recursive: true, force: true });
      mkdirSync(layout.rollbackDir, { recursive: true, mode: 0o700 });
      try {
        if (existsSync(layout.matterDir)) renameSync(layout.matterDir, join(layout.rollbackDir, 'matter'));
        if (existsSync(layout.metadataFile))
          renameSync(layout.metadataFile, join(layout.rollbackDir, 'sidecar-metadata.json'));
        writeFileSync(join(layout.rollbackDir, 'previous.json'), JSON.stringify({ kind: previous.kind, stageId }), {
          mode: 0o600,
        });
        const stagedLayout = layoutFor(staged.directory);
        renameSync(stagedLayout.matterDir, layout.matterDir);
        const stagedMetadata = metadataSchema.parse(JSON.parse(readFileSync(stagedLayout.metadataFile, 'utf8')));
        const nodeIdFloor = advanceRestoredCounters(
          layout.controllerDir,
          Math.max(previousFloor, stagedMetadata.nodeIdFloor ?? 1),
        );
        const metadata: StorageMetadata = {
          ...stagedMetadata,
          writtenBySidecar: this.options.versions.sidecar,
          fabricGeneration: Math.max(stagedMetadata.fabricGeneration, previousGeneration) + 1,
          nodeIdFloor,
          updatedAt: this.now(),
        };
        writeMetadata(layout, metadata);
        const facts = readFabricFacts(layout.controllerDir);
        const controller = this.#newController(nodeIdFloor);
        try {
          await controller.start();
          const loaded = await controller.loadedFacts();
          if (
            loaded?.fabricId !== staged.header.fabricId ||
            loaded.rootCertFingerprint !== staged.header.rootCertFingerprint ||
            facts.fabricId !== staged.header.fabricId
          ) {
            throw new Error('verification failed');
          }
        } catch (error) {
          await controller.stop().catch(() => undefined);
          throw error;
        }
        this.#controller = controller;
        this.#inspection = { kind: 'initialized', metadata, facts };
      } catch (error) {
        await this.#swapBack();
        this.options.logger('error', 'the restore failed verification and was rolled back', {
          error: error instanceof Error ? error.name : 'unknown',
        });
        throw new ApiError('restore_failed', 'The restore failed and the previous Matter storage was put back.');
      }
      this.#pending = { stageId, previous: previous.kind };
      this.#discardStaged();
      this.#announce();
      return { state: 'committed', fabric: this.status() };
    });
  }

  /** Puts the rollback copy back in place of whatever is live, then resumes if that storage is healthy. */
  async #swapBack(): Promise<void> {
    const layout = this.layout;
    await this.#controller?.stop().catch(() => undefined);
    this.#controller = undefined;
    rmSync(layout.matterDir, { recursive: true, force: true });
    rmSync(layout.metadataFile, { force: true });
    const savedMatter = join(layout.rollbackDir, 'matter');
    const savedMetadata = join(layout.rollbackDir, 'sidecar-metadata.json');
    if (existsSync(savedMatter)) renameSync(savedMatter, layout.matterDir);
    if (existsSync(savedMetadata)) renameSync(savedMetadata, layout.metadataFile);
    rmSync(layout.rollbackDir, { recursive: true, force: true });
    this.#inspection = inspectStorage(layout);
    if (this.#inspection.kind === 'initialized') await this.#resume(this.#inspection);
  }

  rollback(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      if (this.#pending?.stageId !== stageId) throw new ApiError('not_found', 'There is no restore to roll back.');
      await this.#swapBack();
      this.#pending = undefined;
      this.#announce();
      return { state: 'rolled_back', fabric: this.status() };
    });
  }

  finalize(stageId: string): Promise<RestoreResult> {
    return this.#exclusive(async () => {
      const pending = this.#pending;
      if (pending?.stageId !== stageId) throw new ApiError('not_found', 'There is no restore to finalize.');
      if (pending.previous === 'recovery') {
        // Broken storage is evidence. It is kept next to the live one instead of being deleted.
        renameSync(this.layout.rollbackDir, join(this.layout.root, `quarantine-${Date.now()}`));
      } else {
        rmSync(this.layout.rollbackDir, { recursive: true, force: true });
      }
      this.#pending = undefined;
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
