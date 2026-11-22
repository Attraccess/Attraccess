import { Injectable } from '@nestjs/common';
import { conflict } from '../fabric/errors';

/**
 * One commissioning session, removal or share at a time, in this plugin: the sidecar's single-flight gate enforces
 * the same on its side. A second request is refused with 409 `busy` instead of waiting.
 */
@Injectable()
export class MatterOperationGate {
  private holder: string | null = null;

  /** Takes the gate for `kind`, or throws 409 `busy`. Returns the function that releases it (idempotent). */
  enter(kind: 'commissioning' | 'removal' | 'sharing'): () => void {
    if (this.holder !== null) {
      throw conflict(
        'busy',
        this.holder === 'commissioning'
          ? 'A commissioning session is already running. Wait for it to finish or cancel it.'
          : 'Another fabric operation is in progress. Try again in a moment.',
      );
    }
    this.holder = kind;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holder = null;
    };
  }

  get busy(): boolean {
    return this.holder !== null;
  }
}
