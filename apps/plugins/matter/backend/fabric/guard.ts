import { Injectable } from '@nestjs/common';
import { conflict } from './errors';
import type { MismatchKind } from './mismatch';

/**
 * The plugin's `recovery.required` state, shared by everything that must not touch the fabric while it is unsettled.
 * Held in memory: it is re-derived on every (re)connect from the sidecar's and the plugin's records.
 */
@Injectable()
export class MatterFabricGuard {
  private current: MismatchKind | null = null;
  /** True while the plugin itself changes the fabric (create, restore): backups wait and events are not judged. */
  busy = false;

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
   * Throws a 409 `recovery_required` while an administrator has to decide how to settle the fabric.
   */
  assertFabricMutationAllowed(): void {
    if (this.current !== null) {
      throw conflict(
        'recovery_required',
        'The Matter fabric needs recovery before it can be changed. Restore a backup, accept the sidecar, or start a new fabric.',
      );
    }
    if (this.busy) throw conflict('busy', 'A fabric operation is in progress.');
  }
}
