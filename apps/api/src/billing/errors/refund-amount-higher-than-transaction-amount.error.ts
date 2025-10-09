import { BadRequestException } from '@nestjs/common';

export class RefundAmountHigherThanTransactionAmountException extends BadRequestException {
  public constructor() {
    super('REFUND_AMOUNT_HIGHER_THAN_TRANSACTION_AMOUNT_EXCEPTION');
  }
}
