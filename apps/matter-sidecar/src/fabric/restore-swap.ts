import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '../api-error';
import type { Logger } from '../logger';
import {
  advanceRestoredCounters,
  layoutFor,
  metadataSchema,
  readFabricFacts,
  writeMetadata,
  type FabricFacts,
  type StorageInspection,
  type StorageLayout,
  type StorageMetadata,
} from './storage';

/**
 * What a restore has done so far, so that undoing it touches nothing it did not move. `quarantined` names the rollback
 * copy of an interrupted restore that this restore moved aside: in a recovery state it may hold the only fabric.
 */
export type SwapProgress = {
  rollbackReady: boolean;
  movedMatter: boolean;
  movedMetadata: boolean;
  installed: boolean;
  quarantined?: string;
};

/** A restore that has not touched anything yet. */
export const freshProgress = (): SwapProgress => ({
  rollbackReady: false,
  movedMatter: false,
  movedMetadata: false,
  installed: false,
});

export type RestoreSwapOptions = {
  layout: StorageLayout;
  logger: Logger;
  sidecarVersion: string;
  /** The current time as an ISO string. */
  now: () => string;
};

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

/**
 * The filesystem side of the two-phase restore: the rollback copy of the storage a restore replaced, its quarantine,
 * and moving storage between the live location, the rollback copy and the stage. It holds no state of its own; the
 * caller tracks a restore's progress in a {@link SwapProgress} and owns the controller.
 */
export class RestoreSwap {
  constructor(private readonly options: RestoreSwapOptions) {}

  get #saved() {
    const { rollbackDir } = this.options.layout;
    return {
      matter: join(rollbackDir, 'matter'),
      metadata: join(rollbackDir, 'sidecar-metadata.json'),
    };
  }

  /** Whether a rollback copy exists at all. */
  exists(): boolean {
    return existsSync(this.options.layout.rollbackDir);
  }

  #holdsStorage(): boolean {
    return existsSync(this.#saved.matter) || existsSync(this.#saved.metadata);
  }

  /**
   * A rollback copy that an earlier process left behind. Unless the live storage is a fabric that resumed, the process
   * stopped in the middle of a restore and the copy may be the only complete fabric: nothing is touched, and true is
   * returned. Otherwise the copy is quarantined. It is never deleted, because it may be the only copy of a fabric.
   */
  settleLeftover(liveResumed: boolean): boolean {
    if (!this.exists()) return false;
    if (!liveResumed && this.#holdsStorage()) return true;
    this.quarantine('a rollback copy left behind by an earlier process was moved to quarantine');
    return false;
  }

  /** Moves the rollback copy aside under a new name. Quarantined copies are never deleted by the sidecar. */
  quarantine(message: string): string {
    const { layout, logger } = this.options;
    const name = `quarantine-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const target = join(layout.root, name);
    renameSync(layout.rollbackDir, target);
    chmodSync(target, 0o700);
    logger('warn', message, { directory: name });
    return name;
  }

  /**
   * A rollback copy that is still there belongs to an earlier restore; it is quarantined, never overwritten. In a
   * recovery state it is the evidence of an interrupted restore, so undoing this restore brings it back.
   */
  quarantineEarlier(progress: SwapProgress, previous: StorageInspection) {
    if (!this.exists()) return;
    const name = this.quarantine('the rollback copy of an earlier restore was moved to quarantine');
    if (previous.kind === 'recovery') progress.quarantined = name;
  }

  createRollback(progress: SwapProgress) {
    mkdirSync(this.options.layout.rollbackDir, { mode: 0o700 });
    progress.rollbackReady = true;
  }

  /** The previous storage is moved, never deleted: it is the rollback copy until the plugin has committed too. */
  moveLiveAside(progress: SwapProgress, previous: StorageInspection['kind'], stageId: string) {
    const { layout } = this.options;
    writeFileSync(join(layout.rollbackDir, 'previous.json'), JSON.stringify({ kind: previous, stageId }), {
      mode: 0o600,
    });
    if (existsSync(layout.matterDir)) {
      renameSync(layout.matterDir, this.#saved.matter);
      progress.movedMatter = true;
    }
    if (existsSync(layout.metadataFile)) {
      renameSync(layout.metadataFile, this.#saved.metadata);
      progress.movedMetadata = true;
    }
  }

  /** Moves the staged storage into the live location and writes its metadata. The controller is not started here. */
  install(
    stagedDirectory: string,
    previous: StorageInspection,
    progress: SwapProgress,
  ): { metadata: StorageMetadata; facts: FabricFacts } {
    const { layout } = this.options;
    const stagedLayout = layoutFor(stagedDirectory);
    renameSync(stagedLayout.matterDir, layout.matterDir);
    progress.installed = true;
    const metadata = this.#restoredMetadata(stagedLayout, previous);
    writeMetadata(layout, metadata);
    return { metadata, facts: readFabricFacts(layout.controllerDir) };
  }

  /** The staged metadata with a generation above both fabrics and node IDs above any the snapshot may have missed. */
  #restoredMetadata(stagedLayout: StorageLayout, previous: StorageInspection): StorageMetadata {
    const before = previous.kind === 'initialized' ? previous.metadata : undefined;
    const stagedMetadata = metadataSchema.parse(JSON.parse(readFileSync(stagedLayout.metadataFile, 'utf8')));
    const nodeIdFloor = advanceRestoredCounters(
      this.options.layout.controllerDir,
      Math.max(before?.nodeIdFloor ?? 1, stagedMetadata.nodeIdFloor ?? 1),
    );
    return {
      ...stagedMetadata,
      writtenBySidecar: this.options.sidecarVersion,
      fabricGeneration: Math.max(stagedMetadata.fabricGeneration, before?.fabricGeneration ?? 0) + 1,
      nodeIdFloor,
      updatedAt: this.options.now(),
    };
  }

  /** What a committed restore has moved, for a rollback that undoes it. */
  committedProgress(quarantined: string | undefined): SwapProgress {
    return {
      rollbackReady: true,
      installed: true,
      movedMatter: existsSync(this.#saved.matter),
      movedMetadata: existsSync(this.#saved.metadata),
      quarantined,
    };
  }

  /** Removes only the storage installed from the stage and puts back only what was moved aside. */
  putBack(progress: SwapProgress) {
    const { layout } = this.options;
    if (progress.installed) {
      rmSync(layout.matterDir, { recursive: true, force: true });
      rmSync(layout.metadataFile, { force: true });
    }
    if (progress.movedMatter) renameSync(this.#saved.matter, layout.matterDir);
    if (progress.movedMetadata) renameSync(this.#saved.metadata, layout.metadataFile);
    // Only what this restore created is removed; everything it moved is back in place by now.
    if (progress.rollbackReady) rmSync(layout.rollbackDir, { recursive: true, force: true });
    if (progress.quarantined) renameSync(join(layout.root, progress.quarantined), layout.rollbackDir);
  }

  /**
   * The restored generation has been announced, so the fabric that comes back gets a newer one, never an older one. It
   * is written into the rollback copy before anything moves: when that fails, nothing has changed.
   */
  raiseSavedGeneration(previous: StorageInspection, generation: number) {
    if (previous.kind !== 'initialized' || !existsSync(this.#saved.metadata)) return;
    const metadata: StorageMetadata = {
      ...previous.metadata,
      fabricGeneration: generation,
      writtenBySidecar: this.options.sidecarVersion,
      updatedAt: this.options.now(),
    };
    try {
      writeMetadata(layoutFor(this.options.layout.rollbackDir), metadata);
    } catch (error) {
      this.options.logger('error', 'the rollback copy could not be prepared', { error: errorName(error) });
      throw new ApiError('internal_error', 'The rollback could not be prepared. Nothing was changed; try again.');
    }
  }

  /** The restore was finalized: its rollback copy is no longer needed. */
  release(previous: StorageInspection) {
    if (previous.kind === 'recovery') {
      // Broken storage is evidence. It is kept next to the live one instead of being deleted.
      this.quarantine('the broken storage a restore replaced was moved to quarantine');
    } else {
      rmSync(this.options.layout.rollbackDir, { recursive: true, force: true });
    }
  }
}
