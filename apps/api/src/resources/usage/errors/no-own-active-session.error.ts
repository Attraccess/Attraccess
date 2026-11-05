import { BadRequestException } from '@nestjs/common';

/** Stop without a usageId on a shared machine where the caller has no session of their own. */
export class NoOwnActiveSessionError extends BadRequestException {
  constructor() {
    super('NoOwnActiveSessionError', {
      description: 'You have no active session on this machine. Choose the session to end.',
    });
  }
}
