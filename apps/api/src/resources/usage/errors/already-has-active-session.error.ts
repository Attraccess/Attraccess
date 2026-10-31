import { BadRequestException } from '@nestjs/common';

export class AlreadyHasActiveSessionError extends BadRequestException {
  constructor() {
    super('AlreadyHasActiveSessionError', {
      description: 'You already have an active session on this machine.',
    });
  }
}
