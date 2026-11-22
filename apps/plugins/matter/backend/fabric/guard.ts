import { Injectable } from '@nestjs/common';
import { conflict } from './errors';
import type { MismatchKind } from './mismatch';

/** A device operation that changes the fabric through the sidecar; one at a time (see MatterOperationGate). */
export type FabricOperation = 'commissioning' | 'removal' | 'sharing';

/** The 409 `busy` while a commissioning session, removal or share holds the operation gate. */
export function operationBusy(operation: FabricOperation) {
  return conflict(
    'busy',
    operation === 'commissioning'
      ? 'A commissioning session is already running. Wait for it to finish or cancel it.'
      : 'Another fabric operation is in progress. Try again in a moment.',
  );
}

/**
 * The plugin's `recovery.required` state, shared by everything that must not touch the fabric while it is unsettled.
 * Held in memory: it is re-derived on every (re)connect from the sidecar's and the plugin's records.
 */
@Injectable()
export class MatterFabricGuard {
  private current: MismatchKind | null = null;
  /** True while the plugin itself changes the fabric (create, restore): backups wait and events are not judged. */
  busy = false;
  /**
   * True after a restore whose outcome on the sidecar stayed unknown (its rollback failed): the sidecar may still apply
   * it. Until the plugin records a fabric itself again, a `fabric.changed` that moves the generation on is judged like
   * a reconnect instead of being recorded as the plugin's own change.
   */
  outcomeUnknown = false;
  /**
   * The commissioning session, removal or share that holds MatterOperationGate, or null. Set only by the gate. The
   * sidecar frees its own gate before the plugin wrote its registry rows: until then backups, restores and fabric
   * creation are refused here.
   */
  operation: FabricOperation | null = null;
  /**
   * True while a restore confirmation runs (its preflight and pre-restore backup come before `busy` is set): a
   * commissioning session, removal or share must not start in that window.
   */
  restoreConfirming = false;
  private restoringNow = false;
  private restoreEpoch = 0;

  /**
   * True from the moment a restore commits on the sidecar until the plugin's tables are replaced. An inventory read
   * in that window, or one that straddles it, describes a sidecar the tables no longer match: reconciliation must not
   * apply it (under the mismatch rules it could detach the restored nodes for good).
   */
  get restoring(): boolean {
    return this.restoringNow;
  }

  set restoring(value: boolean) {
    if (value !== this.restoringNow) this.restoreEpoch += 1;
    this.restoringNow = value;
  }

  /** Changes whenever a restore starts or ends, so a reconciliation can tell that one ran while it was reading. */
  get epoch(): number {
    return this.restoreEpoch;
  }

  get mismatch(): MismatchKind | null {
    return this.current;
  }

  get recoveryRequired(): boolean {
    return this.current !== null;
  }

  set(mismatch: MismatchKind | null): void {
    this.current = mismatch;
  }

  /**
   * The check every fabric-mutating plugin action makes first (fabric creation, commissioning, node removal, ...).
   * Throws a 409 `recovery_required` while an administrator has to decide how to settle the fabric, and a 409 `busy`
   * while the plugin changes the fabric (create, restore) or a commissioning session, removal or share runs.
   */
  assertFabricMutationAllowed(): void {
    if (this.current !== null) {
      throw conflict(
        'recovery_required',
        'The Matter fabric needs recovery before it can be changed. Restore a backup, accept the sidecar, or start a new fabric.',
      );
    }
    if (this.busy || this.restoreConfirming) throw conflict('busy', 'A fabric operation is in progress.');
    if (this.operation !== null) throw operationBusy(this.operation);
  }
}
