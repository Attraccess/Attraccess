import { NotFoundException } from '@nestjs/common';

/** The running session a project switch means is not there (any more). */
export class NoSessionToSwitchError extends NotFoundException {
  constructor() {
    super('No active usage session found');
  }
}
