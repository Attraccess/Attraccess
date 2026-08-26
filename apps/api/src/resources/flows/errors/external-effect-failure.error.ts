import { ServiceUnavailableException } from '@nestjs/common';
import type { FlowFailureKind } from '../node-executors/node-executor.interface';

export class ExternalEffectFailureError extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly failureKind: FlowFailureKind = 'node-failure',
  ) {
    super({
      statusCode: 503,
      error: 'External effect failed',
      message,
      failureKind,
    });
    this.name = 'ExternalEffectFailureError';
  }
}
