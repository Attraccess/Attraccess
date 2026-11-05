import { ServiceUnavailableException } from '@nestjs/common';

/** The server restarted (or another instance cleaned up) while this start or stop was in flight; nothing was changed. */
export class SessionChangeInterruptedError extends ServiceUnavailableException {
  constructor() {
    super('SessionChangeInterruptedError', {
      description:
        'The server restarted while your request was being processed. Nothing was changed. Please try again.',
    });
  }
}
