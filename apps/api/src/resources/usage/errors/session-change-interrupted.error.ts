import { ServiceUnavailableException } from '@nestjs/common';

/**
 * The start or stop was cut off by a server restart, or cleaned up by another API instance, before it was
 * recorded. Its flows may already have run, so the person is asked to check the machine before trying again.
 */
export class SessionChangeInterruptedError extends ServiceUnavailableException {
  constructor() {
    super('SessionChangeInterruptedError', {
      description:
        'The server was restarted while your request was being processed; your start or stop was not recorded. Please check the machine and try again.',
    });
  }
}
