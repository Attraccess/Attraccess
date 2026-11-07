import { ConflictException } from '@nestjs/common';

/** A start or takeover flow ended its own new session before it was committed. */
export class TentativeSessionCancelledError extends ConflictException {
  constructor() {
    super('The tentative usage session was cancelled');
  }
}
