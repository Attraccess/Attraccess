import { NotFoundException } from '@nestjs/common';

export class BillingTransactionNotFoundException extends NotFoundException {
  constructor() {
    super('BILLING_TRANSACTION_NOT_FOUND', {
      description: `billing transaction not`,
    });
  }
}
