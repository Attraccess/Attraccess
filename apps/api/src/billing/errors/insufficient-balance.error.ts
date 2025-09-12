import { BadRequestException } from '@nestjs/common';

export class InsufficientBalanceError extends BadRequestException {
  constructor() {
    super('INSUFFICIENT_BALANCE');
  }
}
