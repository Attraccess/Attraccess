import { BadRequestException } from '@nestjs/common';

export class ResourceInUseError extends BadRequestException {
  constructor() {
    super('ResourceInUseError', {
      description: 'Resource is currently in use by another user',
    });
  }
}
