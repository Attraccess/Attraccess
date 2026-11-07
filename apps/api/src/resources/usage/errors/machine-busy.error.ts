import { ServiceUnavailableException } from '@nestjs/common';

/** A start, stop or takeover waited too long for the previous one on the same shared machine. */
export class MachineBusyError extends ServiceUnavailableException {
  constructor() {
    super('MachineBusyError', {
      description: 'This machine is busy handling another session change. Please try again.',
    });
  }
}
