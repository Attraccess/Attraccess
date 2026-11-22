import { Inject, Injectable } from '@nestjs/common';
import { MatterFabricGuard, operationBusy, type FabricOperation } from '../fabric/guard';

/**
 * One commissioning session, removal or share at a time, in this plugin: the sidecar's single-flight gate enforces
 * the same on its side. A second request is refused with 409 `busy` instead of waiting. The holder is kept on the
 * fabric guard, so backups, restores and fabric creation are refused with `busy` while one runs too.
 */
@Injectable()
export class MatterOperationGate {
  /** The current holder; a release by anyone else is a no-op. */
  private holder: object | null = null;

  constructor(@Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard) {}

  /** Takes the gate for `kind`, or throws 409 `busy`. Returns the function that releases it (idempotent). */
  enter(kind: FabricOperation): () => void {
    if (this.guard.operation !== null) throw operationBusy(this.guard.operation);
    // A restore or fabric creation that started after the caller's own guard check.
    this.guard.assertFabricMutationAllowed();
    const holder = {};
    this.holder = holder;
    this.guard.operation = kind;
    return () => {
      if (this.holder !== holder) return;
      this.holder = null;
      this.guard.operation = null;
    };
  }

  get busy(): boolean {
    return this.guard.operation !== null;
  }
}
