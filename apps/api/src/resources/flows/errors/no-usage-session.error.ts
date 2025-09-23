import { BadRequestException } from '@nestjs/common';

export class NoUsageSessionError extends BadRequestException {
  constructor() {
    super('NO_USAGE_SESSION', 'This action can only be performed when there is an active usage session');
  }
}
