import { UnprocessableEntityException } from '@nestjs/common';

export class FlowExecutionError extends UnprocessableEntityException {
  constructor(message: string) {
    super('FLOW_EXECUTION_ERROR: ' + message);
    this.name = 'FlowExecutionError';
  }
}
